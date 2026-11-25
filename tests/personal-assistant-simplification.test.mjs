import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PA_ANALYSIS_DEFAULTS,
  classifyFindingHonesty,
  countActivePreferenceOverrides,
  describeAnalysisScope,
  describePracticePreset,
  loadAssistantPreferences,
  preferenceStorageKey,
  resetAssistantPreferences,
  resolveDrillTiming,
  sanitizeAssistantPreferences,
  saveAssistantPreferences,
} from '../src/lib/personal-assistant/assistantDefaults.mjs';

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('assistantDefaults: account-scoped preference persistence, sanitization, isolation, and reset', () => {
  const storage = makeMemoryStorage();

  // Corrupt or invalid input sanitizes back to safe defaults
  const sanitized = sanitizeAssistantPreferences({
    format: 'plo_mixed',
    sortMode: 'invalid',
    statusFilter: 'hacked',
    analysisDepth: 'ultra',
    practiceLength: 999,
  });
  assert.equal(sanitized.format, PA_ANALYSIS_DEFAULTS.format);
  assert.equal(sanitized.sortMode, PA_ANALYSIS_DEFAULTS.sortMode);
  assert.equal(sanitized.statusFilter, PA_ANALYSIS_DEFAULTS.statusFilter);
  assert.equal(sanitized.analysisDepth, PA_ANALYSIS_DEFAULTS.analysisDepth);
  assert.equal(sanitized.practiceLength, 20);

  // Account A saves custom settings
  saveAssistantPreferences(storage, 'user-a', {
    format: 'tournament',
    sortMode: 'confidence',
    statusFilter: 'persistent',
  });
  assert.equal(preferenceStorageKey('user-a'), 'pa-assistant-prefs-v1:user-a');
  assert.equal(countActivePreferenceOverrides(loadAssistantPreferences(storage, 'user-a')), 3);
  assert.match(describeAnalysisScope(loadAssistantPreferences(storage, 'user-a')), /Tournament NLH Only/);

  // Account B stays completely isolated at defaults (account switching safety)
  const userB = loadAssistantPreferences(storage, 'user-b');
  assert.equal(userB.format, 'all');
  assert.equal(userB.sortMode, 'impact');
  assert.equal(countActivePreferenceOverrides(userB), 0);

  // Reset restores Account A cleanly
  const reset = resetAssistantPreferences(storage, 'user-a');
  assert.equal(reset.format, 'all');
  assert.equal(countActivePreferenceOverrides(loadAssistantPreferences(storage, 'user-a')), 0);
});

test('assistantDefaults: resolveHomePrimaryState returns one clear CTA for every user state', async () => {
  const { resolveHomePrimaryState } = await import('../src/lib/personal-assistant/assistantDefaults.mjs');

  assert.equal(resolveHomePrimaryState({ loading: true }).state, 'loading');
  assert.equal(resolveHomePrimaryState({ loading: true }).disabled, true);

  assert.equal(resolveHomePrimaryState({ syncError: new Error('net') }).ctaAction, 'retry');
  assert.equal(resolveHomePrimaryState({ auditRunning: true }).state, 'audit_running');

  const reviewDue = resolveHomePrimaryState({ isSignedIn: true, reviewDueCount: 2, activeLeaksCount: 3 });
  assert.equal(reviewDue.state, 'review_due');
  assert.equal(reviewDue.ctaLabel, 'Start Review');

  const finding = resolveHomePrimaryState({ isSignedIn: true, activeLeaksCount: 2, topLeakTitle: 'Overfolding Turn' });
  assert.equal(finding.state, 'finding_ready');
  assert.equal(finding.title, 'Overfolding Turn');

  const practice = resolveHomePrimaryState({ isSignedIn: true, hasPracticeInProgress: true, trainingPlanTitle: 'BTN C-Bet Plan' });
  assert.equal(practice.state, 'practice_in_progress');
  assert.equal(practice.ctaLabel, 'Continue Practice');

  const analyze = resolveHomePrimaryState({ isSignedIn: true, sessionsReviewed: 4, handsAnalyzed: 0 });
  assert.equal(analyze.state, 'history_no_analysis');
  assert.equal(analyze.ctaLabel, 'Analyze My Play');
  assert.equal(analyze.ctaAction, 'analyze_now');

  const brandNewSignedIn = resolveHomePrimaryState({ isSignedIn: true, sessionsReviewed: 0, handsAnalyzed: 0 });
  assert.equal(brandNewSignedIn.state, 'no_history');
  assert.equal(brandNewSignedIn.ctaLabel, 'Open Verified Training');

  const analyzedClean = resolveHomePrimaryState({ isSignedIn: true, sessionsReviewed: 0, handsAnalyzed: 42, activeLeaksCount: 0 });
  assert.equal(analyzedClean.state, 'finding_ready');
  assert.equal(analyzedClean.ctaAction, 'analyze_now');

  const guest = resolveHomePrimaryState({ isSignedIn: false });
  assert.equal(guest.state, 'no_history');
  assert.equal(guest.ctaLabel, 'Open Verified Training');
});

test('assistantDefaults: classifyFindingHonesty distinguishes all 5 required honesty categories', () => {
  assert.equal(classifyFindingHonesty(null).code, 'unmeasured');
  assert.equal(
    classifyFindingHonesty({ status: 'active', occurrenceCount: 12, solverEvidence: false, evLossMeasured: false }).code,
    'unmeasured',
  );
  assert.equal(
    classifyFindingHonesty({ gameVariant: 'plo4', occurrenceCount: 12 }).code,
    'unsupported',
  );
  assert.equal(
    classifyFindingHonesty({ status: 'active', occurrenceCount: 8, solverEvidence: true }, { retired: true }).code,
    'reassess',
  );
  assert.match(
    classifyFindingHonesty({ status: 'active', occurrenceCount: 8, solverEvidence: true }, { retired: true }).detail,
    /Fresh Club Arena hands must confirm/i,
  );
  assert.equal(
    classifyFindingHonesty({ status: 'emerging', occurrenceCount: 2, confidence: 'low', solverEvidence: true }).code,
    'emerging',
  );
  assert.equal(
    classifyFindingHonesty({ status: 'persistent', occurrenceCount: 14, confidence: 'high', solverEvidence: true, evLossMeasured: true, evLossBB: 0.42 }).code,
    'supported',
  );
});

test('Personal Assistant surfaces align to approved MTT lobby design tokens, optional disclosures, and reload-safe autorun', () => {
  const hubCss = fs.readFileSync(path.resolve('src/styles/worlds/PersonalAssistantHub.module.css'), 'utf8');
  const toolsCss = fs.readFileSync(path.resolve('src/styles/worlds/PersonalAssistantTools.module.css'), 'utf8');
  const coachCss = fs.readFileSync(path.resolve('src/components/personal-assistant/CoachingWorkspace.module.css'), 'utf8');
  const leaksSrc = fs.readFileSync(path.resolve('pages/hub/personal-assistant/leaks.js'), 'utf8');
  const homeSrc = fs.readFileSync(path.resolve('pages/hub/personal-assistant/index.js'), 'utf8');
  const sandboxSrc = fs.readFileSync(path.resolve('pages/hub/personal-assistant/sandbox.js'), 'utf8');
  const paKitSrc = fs.readFileSync(path.resolve('src/components/sandbox/paKit.jsx'), 'utf8');

  // Approved MTT lobby palette & 600px interior
  for (const [name, css] of [['hub', hubCss], ['tools', toolsCss], ['sandbox', sandboxSrc]]) {
    assert.match(css, /#040d18/i, `${name} must use approved #040d18 MTT lobby canvas`);
  }
  assert.match(hubCss, /min\(600px/, 'Home must use 600px MTT lobby interior');
  assert.match(sandboxSrc, /min\(100% - 12px, 600px\)/, 'Sandbox boundary must use 600px MTT lobby interior');
  assert.match(hubCss, /#087cfa/, 'Home primary CTA / active tab must use MTT lobby royal blue');
  assert.match(coachCss, /#087cfa/, 'Coaching Workspace primary CTA / active tab must use MTT lobby royal blue');

  // WCAG 1.4.1 non-color active tab underline indicator
  assert.match(hubCss, /border-block-end:\s*3px solid/, 'Home active tab needs non-color underline');
  assert.match(coachCss, /border-block-end:\s*3px solid/, 'Coaching active view tab needs non-color underline');
  assert.match(paKitSrc, /border-block-end:\s*3px solid/, 'Segmented active button needs non-color underline');

  // Progressive disclosure & reload-safe autorun
  assert.match(leaksSrc, /<details className="pa-disclosure"/, 'Leak Finder must move optional settings/telemetry into native details');
  assert.match(leaksSrc, /Analysis Settings/, 'Leak Finder must expose Analysis Settings');
  assert.match(leaksSrc, /Reset To Defaults/, 'Leak Finder must provide Reset To Defaults');
  assert.match(leaksSrc, /autorunTriggeredRef/, 'autorun handoff must clear query param and guard against reload duplicates');
  assert.match(homeSrc, /resolveHomePrimaryState/, 'Home must use centralized state resolver');
  assert.match(homeSrc, /<details className=\{styles\.disclosure\}>/, 'Home must tuck secondary sections behind native details');

  // Swarm audit hardening: zero display:none, >= 12px range font, opt-in reduced motion, strict format separation, no legacy neon grid/banner
  assert.doesNotMatch(paKitSrc, /::-webkit-details-marker\s*\{\s*display:\s*none/, 'paKit disclosure marker must not use display: none');
  assert.doesNotMatch(paKitSrc, /clamp\(8px,/, 'paKit range grid font must stay >= 12px');
  assert.doesNotMatch(paKitSrc, /Personal Assistant \/\/ Module Active/, 'BottomSheet must not show legacy sci-fi banner');
  assert.doesNotMatch(leaksSrc, /prefers-reduced-motion:\s*reduce/, 'leaks.js must use opt-in prefers-reduced-motion: no-preference');
  assert.match(leaksSrc, /prefers-reduced-motion:\s*no-preference/, 'leaks.js must opt in to motion');
  assert.doesNotMatch(leaksSrc, /return isCash \|\| !isTournament/, 'Cash filter must never lump untagged/unknown formats into Cash NLH');
  assert.match(leaksSrc, /onClick=\{handleResetAnalysisSettings\}/, 'Reset Filters must persist reset preferences');
  assert.match(leaksSrc, /detailHonesty/, 'LeakDetail must display finding honesty badge');

  // Phase 3 practice preset wiring & global world palette alignment
  assert.equal(resolveDrillTiming('fundamentals').durationSeconds, 25);
  assert.equal(resolveDrillTiming('adaptive').durationSeconds, 15);
  assert.equal(resolveDrillTiming('pressure').durationSeconds, 10);
  assert.equal(resolveDrillTiming('bogus').durationSeconds, 15);
  assert.equal(
    describePracticePreset({ practiceLength: 20, practiceDifficulty: 'pressure' }),
    '20 Spots · Pressure · 10s',
  );
  assert.equal(
    countActivePreferenceOverrides({ practiceLength: 5, practiceDifficulty: 'fundamentals' }),
    2,
  );

  const quickDrillSrc = fs.readFileSync(path.resolve('src/components/sandbox/QuickSpotDrill.jsx'), 'utf8');
  const worldCss = fs.readFileSync(path.resolve('src/styles/worlds/personal-assistant.css'), 'utf8');
  assert.match(quickDrillSrc, /resolveDrillTiming/, 'QuickSpotDrill must derive timer pacing from resolveDrillTiming');
  assert.match(leaksSrc, /practiceDifficulty=\{practiceDifficulty\}/, 'Leak Finder must pass practiceDifficulty into QuickSpotDrill');
  assert.match(leaksSrc, /limit:\s*String\(practiceLength\)/, 'Leak Finder must pass practiceLength into drill review params');
  assert.match(worldCss, /#040d18/i, 'Global PA world stylesheet must align to #040d18 MTT lobby canvas');
  assert.match(worldCss, /#087cfa/i, 'Global PA world stylesheet must align to #087cfa MTT lobby primary');
});
