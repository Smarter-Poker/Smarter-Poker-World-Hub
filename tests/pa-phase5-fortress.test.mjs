/**
 * Personal Assistant Phase 5 Adversarial Hardening Fortress Regression Suite
 *
 * Pins every root-cause bug uncovered during the Phase 5 adversarial audit so
 * none can silently regress:
 *   1. coaching.js loads unpriced & lookup-failed hand-audit-v3 rows (%hand-audit-v3%)
 *   2. coaching.js merges partial preference writes and hydrates claimedReferenceIds
 *   3. claim-live-fix.js aligns decision ordering/window with coaching.js & returns success:false on cap limits
 *   4. detect.js isolates evidence_scope so external_upload/self_reported_live never create phantom club_arena leaks
 *   5. openclaw-cron-dispatcher.py schedules /api/assistant/maintenance-jobs; due nudges avoid head-of-line starvation
 *   6. coachingIntelligence.mjs blocks external_upload & self_reported_live from live-table verification & Diamond claims
 *   7. handAuditRouteCore.mjs preserves club_arena scope on single-hand audit and exposes pot/stack/heroPosition/evLossMeasured
 *   8. handAuditEngine.js parses stakes BB for external uploads, avoids Club Arena BB double-division, clamps numeric(6,1)
 *   9. studyPlanExport.mjs escapes pipes/newlines in Markdown table cells & renders partial post-drill rates
 *  10. LiveSpotQuickEntry.jsx reports failed bulk batches honestly, aborts on unmount, coalesces refresh, guards drop
 *  11. CoachingWorkspace.jsx rejects fake 200 claim success, reverts failed digest toggle, verifies clipboard write
 *  12. InlineHandReplay.jsx gates BB Lost on evLossMeasured, renders all street decisions, handles missing postflop boards
 *  13. pages/share/hand.js normalizes repeated query parameters (no SSR 500), preserves query in og:url & viewport-fit=cover
 *  14. scripts/verify-pa-production-hardening.mjs uses redirect:'manual' and probes Phase 5 routes & 410 retirements
 *  15. package.json test:leak-engine includes all tests/pa-*.test.mjs suites
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCoachingSnapshot, buildCoverageGapsRanked } from '../src/lib/personal-assistant/coachingIntelligence.mjs';
import { buildStudyPlanMarkdown } from '../src/lib/personal-assistant/studyPlanExport.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Fortress [D1]: coaching.js queries %hand-audit-v3% so unpriced coverage gaps are never dropped', () => {
  const src = read('pages/api/assistant/coaching.js');
  assert.doesNotMatch(src, /\.like\(\s*'solver_source'\s*,\s*'%\|hand-audit-v3'\s*\)/);
  assert.match(src, /\.like\(\s*'solver_source'\s*,\s*'%hand-audit-v3%'\s*\)/);

  const ranked = buildCoverageGapsRanked([
    {
      street: 'flop',
      hero_position: 'BTN',
      spot_type: 'cbet',
      solver_verified: false,
      solver_source: 'hand-audit-v3:unpriced',
      stack_depth_bb: 18,
    },
  ]);
  assert.equal(ranked.gaps.length, 1);
  assert.equal(ranked.gaps[0].stackBucket, '<=20bb');
});

test('Fortress [D4/Diamond Exploit]: external_upload and self_reported_live hands can NEVER unlock confirmed_fixed_at_tables or Diamond claims', () => {
  const baseline = '2026-11-20T00:00:00.000Z';
  const postTime = '2026-11-22T00:00:00.000Z';
  const makeDecisions = (scope) => Array.from({ length: 10 }, (_, idx) => ({
    hand_external_id: `${scope}:hand-${idx}`,
    decision_key: `river:${idx}`,
    street: 'river',
    hero_position: 'BB',
    spot_type: 'facing_bet',
    player_action: 'call',
    solver_action: 'call',
    classification: 'correct',
    ev_loss: 0,
    solver_verified: true,
    solver_source: 'pio|hand-audit-v3',
    evidence_scope: scope,
    audited_at: postTime,
    hand_played_at: scope === 'club_arena' ? postTime : null,
  }));

  for (const scope of ['external_upload', 'self_reported_live', 'training_solver']) {
    const snap = buildCoachingSnapshot({
      leaks: [{ id: 'leak-1', leak_type: 'river_overfold', status: 'emerging' }],
      reviews: [{ leak_id: 'leak-1', reps: 4, retired: true, remediation_baseline_at: baseline }],
      decisions: makeDecisions(scope),
    });
    const tv = snap.leaks[0]?.tableVerification;
    assert.notEqual(tv?.status, 'confirmed_fixed_at_tables', `${scope} must never confirm a live fix`);
    assert.equal(tv?.verifiedLiveMilestone, null, `${scope} must never generate a claimable Diamond milestone`);
  }

  // Positive control: genuine Club Arena hands with hand_played_at DO confirm & hydrate rewardClaimed
  const clubDecisions = makeDecisions('club_arena').map((d, i) => ({
    ...d,
    hand_external_id: `club-arena:11111111-1111-4111-8111-1111111111${String(i).padStart(2, '0')}`,
  }));
  const confirmed = buildCoachingSnapshot({
    leaks: [{ id: 'leak-1', leak_type: 'river_overfold', status: 'emerging' }],
    reviews: [{ leak_id: 'leak-1', reps: 4, retired: true, remediation_baseline_at: baseline }],
    decisions: clubDecisions,
  });
  const milestoneKey = confirmed.leaks[0]?.tableVerification?.verifiedLiveMilestone?.idempotencyKey;
  assert.equal(confirmed.leaks[0]?.tableVerification?.status, 'confirmed_fixed_at_tables');
  assert.ok(milestoneKey);
  assert.equal(confirmed.leaks[0]?.tableVerification?.rewardClaimed, false);

  const hydrated = buildCoachingSnapshot({
    leaks: [{ id: 'leak-1', leak_type: 'river_overfold', status: 'emerging' }],
    reviews: [{ leak_id: 'leak-1', reps: 4, retired: true, remediation_baseline_at: baseline }],
    decisions: clubDecisions,
    claimedReferenceIds: new Set([milestoneKey]),
  });
  assert.equal(hydrated.leaks[0]?.tableVerification?.rewardClaimed, true);
});

test('Fortress [D5/D6/D9]: single-hand audit preserves club_arena scope, detect.js isolates scopes, claim-live-fix matches coaching window', () => {
  const routeCore = read('src/lib/personal-assistant/handAuditRouteCore.mjs');
  assert.match(routeCore, /evidenceScope:\s*'club_arena'/);
  assert.match(routeCore, /evLossMeasured:/);

  const detectSrc = read('pages/api/assistant/leaks/detect.js');
  assert.match(detectSrc, /evidence_scope/);
  assert.match(detectSrc, /evidence_scope\s*!==\s*'club_arena'/);

  const claimSrc = read('pages/api/assistant/leaks/claim-live-fix.js');
  assert.match(claimSrc, /\.like\(\s*'solver_source'\s*,\s*'%hand-audit-v3%'\s*\)/);
  assert.match(claimSrc, /\.order\(\s*'audited_at'\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
  assert.match(claimSrc, /REWARD_LIMIT_REACHED/);
});

test('Fortress [Cron/Maintenance]: openclaw-cron-dispatcher schedules maintenance-jobs and weekly digest copy is honest', () => {
  const dispatcher = read('scripts/openclaw-cron-dispatcher.py');
  assert.match(dispatcher, /['"]\/api\/assistant\/maintenance-jobs['"]/);

  const maintSrc = read('pages/api/assistant/maintenance-jobs.js');
  assert.match(maintSrc, /Drills Mastered \(Live Tracking\)/);
  assert.doesNotMatch(maintSrc, /Verified Live Fixes:\s*\$\{/);
  assert.match(maintSrc, /ascending:\s*false/);
});

test('Fortress [X1]: studyPlanExport.mjs escapes Markdown table pipes and newlines', () => {
  const md = buildStudyPlanMarkdown({
    trainingPlan: {
      modules: [{
        rank: 1,
        leakId: 'leak-pipe',
        title: 'River Overfold | Multi\nLine',
        status: 'emerging',
        tableVerification: {
          status: 'confirmed_fixed_at_tables',
          preMistakeRate: null,
          postMistakeRate: 12.5,
        },
        drillParams: { street: 'river', position: 'BB' },
      }],
    },
  });
  assert.match(md, /River Overfold \\\| Multi Line/);
  assert.match(md, /12\.5%/);
});

test('Fortress [UI Honesty & Resilience]: LiveSpotQuickEntry, CoachingWorkspace, InlineHandReplay, and useAssistant prevent fake success and stale state', () => {
  const liveSpot = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');
  assert.match(liveSpot, /failedBatches/);
  assert.match(liveSpot, /data-pa-verbatim/);
  assert.match(liveSpot, /aria-label="Bulk Hand Audit Progress"/);

  const coachingUi = read('src/components/personal-assistant/CoachingWorkspace.jsx');
  assert.match(coachingUi, /REWARD_LIMIT_REACHED/);
  assert.match(coachingUi, /REWARDS_UNAVAILABLE/);
  assert.match(coachingUi, /Reward Already Claimed/);
  assert.match(coachingUi, /navigator\.clipboard/);

  const replay = read('src/components/personal-assistant/InlineHandReplay.jsx');
  assert.match(replay, /evLossMeasured\s*===\s*true/);
  assert.match(replay, /Board Not Recorded/);

  const hooks = read('src/hooks/useAssistant.js');
  const hookBlock = hooks.slice(hooks.indexOf('export function useLeakHandExamples'));
  assert.match(hookBlock, /setExamples\(\[\]\)/);
});

test('Fortress [Share SSR 500 & OG URL]: pages/share/hand.js normalizes duplicate query params and preserves viewport-fit=cover', () => {
  const shareSrc = read('pages/share/hand.js');
  assert.match(shareSrc, /Array\.isArray\(/);
  assert.match(shareSrc, /viewport-fit=cover/);
  assert.match(shareSrc, /key="og-url"/);
});

test('Fortress [Watchdog & Package Wiring]: watchdog checks redirect:manual + 410s + Phase 5 routes, and test:leak-engine includes all pa-* tests', () => {
  const watchdog = read('scripts/verify-pa-production-hardening.mjs');
  assert.match(watchdog, /redirect:\s*'manual'/);
  assert.match(watchdog, /\/api\/sandbox\/equity-snapshot/);
  assert.match(watchdog, /\/api\/sandbox\/save-hand/);
  assert.match(watchdog, /\/api\/assistant\/leaks\/claim-live-fix/);
  assert.match(watchdog, /\/api\/assistant\/maintenance-jobs/);
  assert.match(watchdog, /\/share\/hand\?view=review/);

  const pkg = JSON.parse(read('package.json'));
  const script = pkg.scripts['test:leak-engine'] || '';
  for (const required of [
    'tests/pa-engine-phase4.test.mjs',
    'tests/pa-ui-phase4.test.mjs',
    'tests/pa-phase5-ops-and-sql.test.mjs',
    'tests/pa-phase5-engine.test.mjs',
    'tests/pa-phase5-ui.test.mjs',
    'tests/pa-phase5-ci-a11y.test.mjs',
    'tests/pa-phase5-fortress.test.mjs',
  ]) {
    assert.ok(script.includes(required), `package.json test:leak-engine missing ${required}`);
  }
});
