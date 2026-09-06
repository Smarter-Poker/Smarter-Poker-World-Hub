import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildCoachingSnapshot,
  buildEvidenceChain,
  confidenceBreakdown,
  decisionCoverage,
  receiptFingerprint,
} from '../src/lib/personal-assistant/coachingIntelligence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const now = Date.parse('2026-09-06T12:00:00.000Z');
const leaks = [
  {
    id: 'leak-a', title: 'River Overfold', status: 'persistent', totalSamples: 40,
    mistakeCount: 12, occurrenceCount: 12, evLossMeasured: true, evLossBB: 0.7,
    firstDetected: '2026-08-01T00:00:00.000Z', leakType: 'river_overfold',
  },
  {
    id: 'leak-b', title: 'Button Defense', status: 'emerging', totalSamples: 8,
    mistakeCount: 3, occurrenceCount: 3, evLossMeasured: false, evLossBB: null,
    firstDetected: '2026-09-01T00:00:00.000Z', leakType: 'button_defense',
  },
];
const decisions = [
  { hand_external_id: 'hand-1', decision_key: 'decision-1', leak_type: 'river_overfold', solver_verified: true, ev_loss_measured: true, ev_loss: 0.7, solver_source: 'solver|hand-audit-v3', classification: 'mistake', audited_at: '2026-09-05T00:00:00.000Z' },
  { hand_external_id: 'hand-2', decision_key: 'decision-2', leak_type: 'button_defense', solver_verified: false, ev_loss_measured: false, solver_source: 'hand-audit-v3:unpriced', match_tier: 1, classification: 'unpriced', audited_at: '2026-09-04T00:00:00.000Z' },
];
const reviews = [{ leak_id: 'leak-a', due_at: '2026-09-05T00:00:00.000Z', history: [{ at: '2026-09-03T00:00:00.000Z', score: 0.8 }] }];

test('coverage separates verified, partial, priced, unpriced, and rejected evidence', () => {
  assert.deepEqual(decisionCoverage(decisions, { missingPrivateCards: 2 }), {
    decisions: 2,
    verified: 1,
    priced: 1,
    unpriced: 1,
    partiallyMatched: 1,
    rejected: 2,
    verifiedPercent: 25,
    pricedPercent: 50,
    solverEvidence: 1,
    aiGuidance: 0,
    offlineEstimate: 0,
    unclassified: 1,
  });
});

test('confidence is measurable and explains missing EV evidence', () => {
  const high = confidenceBreakdown(leaks[0], { verifiedPercent: 50 });
  const low = confidenceBreakdown(leaks[1], { verifiedPercent: 0 });
  assert.ok(high.score > low.score);
  assert.match(low.reasons.join(' '), /Unpriced/);
  assert.equal(high.samples, 40);
  assert.equal(high.mistakes, 12);
});

test('coaching snapshot ranks due measured leaks and preserves empirical resolution boundary', () => {
  const snapshot = buildCoachingSnapshot({ leaks, decisions, reviews, rejected: { missingPrivateCards: 2 }, now, versions: { matcher: 'hand-audit-v3' } });
  assert.equal(snapshot.priorities[0].id, 'leak-a');
  assert.equal(snapshot.nextBestAction.action, 'Complete The Due Corrective Review');
  assert.equal(snapshot.summary.active, 2);
  assert.equal(snapshot.summary.resolved, 0);
  assert.equal(snapshot.weeklyReport.focus.length, 2);
  assert.equal(snapshot.versions.matcher, 'hand-audit-v3');
  assert.ok(snapshot.timeline.some(event => event.type === 'review'));
});

test('evidence inspector fails closed when a stage has no source evidence', () => {
  const chain = buildEvidenceChain(leaks[0], decisions, reviews, { matcher: 'hand-audit-v3' });
  assert.equal(chain[0].detail, 'hand-1');
  assert.equal(chain[1].detail, 'decision-1');
  assert.equal(chain[2].state, 'verified');
  const absent = buildEvidenceChain({ id: 'unknown', title: 'Unknown' }, [], [], {});
  assert.equal(absent[0].state, 'unavailable');
  assert.match(absent[0].detail, /No Source Hand/);
});

test('receipt fingerprints are stable and version-sensitive', () => {
  const a = buildCoachingSnapshot({ leaks, decisions, reviews, now, versions: { matcher: 'v3' } });
  const b = buildCoachingSnapshot({ leaks, decisions, reviews, now, versions: { matcher: 'v3' } });
  const c = buildCoachingSnapshot({ leaks, decisions, reviews, now, versions: { matcher: 'v4' } });
  assert.equal(receiptFingerprint(a), receiptFingerprint(b));
  assert.notEqual(receiptFingerprint(a), receiptFingerprint(c));
});

test('coaching workspace is owner scoped, persisted, and force protected by RLS', () => {
  const migration = read('supabase/migrations/20260906090000_personal_assistant_coaching_workspace.sql');
  for (const table of ['pa_coaching_goals', 'pa_coach_feedback', 'pa_coaching_preferences']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`ON public\\.${table}[\\s\\S]*auth\\.uid\\(\\).*user_id`));
  }
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(migration, /DO \$\$/);
  assert.match(migration, /-- ROLLBACK:/);
});

test('coaching API authenticates server-side and supports only bounded explicit writes', () => {
  const api = read('pages/api/assistant/coaching.js');
  assert.match(api, /getServerUserWithFallback\(req, supabase\)/);
  assert.doesNotMatch(api, /req\.body\.userId|req\.query\.userId/);
  assert.match(api, /save_goal/);
  assert.match(api, /submit_feedback/);
  assert.match(api, /save_preferences/);
  assert.match(api, /Cache-Control', 'private, no-store/);
  assert.match(api, /\.eq\('user_id', userId\)/);
});

test('Leak Finder wires the complete coaching and exact-hand continuity workspace', () => {
  const page = read('pages/hub/personal-assistant/leaks.js');
  const workspace = read('src/components/personal-assistant/CoachingWorkspace.jsx');
  assert.match(page, /value: 'coaching', label: 'Coaching'/);
  assert.match(page, /<CoachingWorkspace/);
  assert.match(page, /onPracticeExample=\{handlePracticeExample\}/);
  assert.match(workspace, /useLeakHandExamples\(exampleLeakId\)/);
  assert.match(workspace, /Open Exact Sandbox Spot/);
  assert.match(workspace, /No Persisted Example Hand Is Attached/);
  assert.match(workspace, /Weekly Coaching Report/);
  assert.match(workspace, /Analysis Receipt/);
});

test('Phase 7 is permanently included in the leak engine and production watchdog gates', () => {
  const pkg = JSON.parse(read('package.json'));
  const watchdog = read('scripts/verify-pa-production-hardening.mjs');
  assert.match(pkg.scripts['test:leak-engine'], /personal-assistant-phase-seven\.test\.mjs/);
  assert.match(watchdog, /'\/api\/assistant\/coaching'/);
  for (const table of ['pa_coaching_goals', 'pa_coach_feedback', 'pa_coaching_preferences']) {
    assert.match(watchdog, new RegExp(`'${table}'`));
  }
});
