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

test('Personal Assistant preserves its approved landing composition, optional disclosures, and reload-safe autorun', () => {
  const hubCss = fs.readFileSync(path.resolve('src/styles/worlds/PersonalAssistantHub.module.css'), 'utf8');
  const toolsCss = fs.readFileSync(path.resolve('src/styles/worlds/PersonalAssistantTools.module.css'), 'utf8');
  const coachCss = fs.readFileSync(path.resolve('src/components/personal-assistant/CoachingWorkspace.module.css'), 'utf8');
  const leaksSrc = fs.readFileSync(path.resolve('pages/hub/personal-assistant/leaks.js'), 'utf8');
  const homeSrc = fs.readFileSync(path.resolve('pages/hub/personal-assistant/index.js'), 'utf8');
  const sandboxSrc = fs.readFileSync(path.resolve('pages/hub/personal-assistant/sandbox.js'), 'utf8');
  const paKitSrc = fs.readFileSync(path.resolve('src/components/sandbox/paKit.jsx'), 'utf8');

  // The user-approved illustrated home replaces the former compact MTT interior.
  // Existing tools and the native Sandbox keep their established palette.
  for (const [name, css] of [['tools', toolsCss], ['sandbox', sandboxSrc]]) {
    assert.match(css, /#040d18/i, `${name} must use approved #040d18 MTT lobby canvas`);
  }
  assert.match(homeSrc, /<HubPageShell\b/, 'Home keeps the app-owned responsive shell');
  assert.match(hubCss, /\.featureArt\s*\{[^}]*object-fit:\s*contain;/, 'Home artwork must remain complete and proportional');
  assert.match(sandboxSrc, /className="sandbox-workspace"/, 'Sandbox workspace must frame the native table');
  assert.match(hubCss, /#087cfa/, 'Home primary CTA must retain the approved royal-blue emphasis');
  assert.match(coachCss, /#087cfa/, 'Coaching Workspace primary CTA / active tab must use MTT lobby royal blue');

  // Home has direct destinations, while the retained tabbed tools need a non-color indicator.
  assert.match(hubCss, /:focus-visible\s*\{[^}]*outline:/, 'Home controls retain visible keyboard focus');
  assert.match(coachCss, /border-block-end:\s*3px solid/, 'Coaching active view tab needs non-color underline');
  assert.match(paKitSrc, /border-block-end:\s*3px solid/, 'Segmented active button needs non-color underline');

  // Progressive disclosure & reload-safe autorun
  assert.match(leaksSrc, /<details className="pa-disclosure"/, 'Leak Finder must move optional settings/telemetry into native details');
  assert.match(leaksSrc, /Analysis Settings/, 'Leak Finder must expose Analysis Settings');
  assert.match(leaksSrc, /Reset To Defaults/, 'Leak Finder must provide Reset To Defaults');
  assert.match(leaksSrc, /autorunTriggeredRef/, 'autorun handoff must clear query param and guard against reload duplicates');
  assert.match(homeSrc, /\/hub\/personal-assistant\/review/, 'Home must lead with Review My Play');
  assert.match(homeSrc, /\/hub\/personal-assistant\/sandbox/, 'Home must open Virtual Sandbox');

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

test('Phase 3 anti-regression fortress: every audited bug is hard-coded fixed and permanently guarded', async () => {
  const { resolveHomePrimaryState } = await import('../src/lib/personal-assistant/assistantDefaults.mjs');
  const { buildCoachingSnapshot } = await import('../src/lib/personal-assistant/coachingIntelligence.mjs');

  // 1. Heuristic unmeasured leak (evLossMeasured: false, evLossBB: 0.42) must NEVER claim measured EV
  const heuristicLivePlay = classifyFindingHonesty({
    sourceSystem: 'live_play',
    occurrenceCount: 14,
    confidence: 'high',
    evLossMeasured: false,
    evLossBB: 0.42,
  });
  assert.equal(heuristicLivePlay.code, 'unmeasured');

  const heuristicFacts = classifyFindingHonesty({
    source_system: 'ca_hand_facts',
    occurrence_count: 4,
    total_samples: 45,
    confidence: 'medium',
    ev_loss_measured: false,
    avg_ev_loss_bb: 0.12,
  });
  assert.equal(heuristicFacts.code, 'supported');
  assert.match(heuristicFacts.detail, /EV impact unpriced/i);

  // 2. Signed-in Club Arena player with unanalyzed hands lands on Analyze My Play, NOT Open Verified Training
  const unanalyzedClubPlayer = resolveHomePrimaryState({
    isSignedIn: true,
    isDemo: false,
    availableClubArenaHands: 250,
    handsAnalyzed: 0,
    sessionsReviewed: 0,
  });
  assert.equal(unanalyzedClubPlayer.state, 'history_no_analysis');
  assert.equal(unanalyzedClubPlayer.ctaAction, 'analyze_now');
  assert.match(unanalyzedClubPlayer.summary, /250 completed Club Arena hands/i);

  // 3. buildCoachingSnapshot preserves null measuredEvLoss when all active leaks are unpriced (never 0.00 BB)
  const unpricedSnapshot = buildCoachingSnapshot({
    leaks: [{
      id: 'l-1',
      title: 'Unpriced Leak',
      status: 'active',
      confidence: 'medium',
      occurrence_count: 8,
      ev_loss_measured: false,
      avg_ev_loss_bb: 0.1,
    }],
    decisions: [],
    reviews: [],
  });
  assert.equal(unpricedSnapshot.summary.measuredEvLoss, null);
  assert.equal(unpricedSnapshot.weeklyReport.measuredEvLoss, null);

  // 4. Producer-to-consumer contract pins across API, hooks, and pages
  const customDrillSrc = fs.readFileSync(path.resolve('pages/api/sandbox/_routes/custom-drill.js'), 'utf8');
  assert.match(customDrillSrc, /const requestedLimit = parseInt\(rawLimit, 10\)/, 'custom-drill must honor caller limit before ownedDrillParams.limit');
  assert.match(customDrillSrc, /pushUniqueMapped/, 'custom-drill must guard non-null and deduplicate incrementally during paging');
  assert.match(customDrillSrc, /const practiceOnly = Boolean\(drillUserId && !drillToken\);/, 'custom-drill must preserve practiceOnly flag');

  const drillAnswerSrc = fs.readFileSync(path.resolve('pages/api/assistant/leaks/drill-answer.js'), 'utf8');
  assert.match(drillAnswerSrc, /p_is_correct:\s*lockedCorrect/, 'drill-answer must record locked answer correctness on idempotent retries');
  assert.match(drillAnswerSrc, /selectedAnswer:\s*lockedSelected/, 'drill-answer must record locked answer choice on idempotent retries');

  const coachingApiSrc = fs.readFileSync(path.resolve('pages/api/assistant/coaching.js'), 'utf8');
  assert.match(coachingApiSrc, /in\('status', \['queued', 'running'\]\)/, 'coaching API must query active queued/running audit jobs');
  assert.match(coachingApiSrc, /activeAuditRunning/, 'coaching API must emit activeAuditRunning on snapshot');

  const statsApiSrc = fs.readFileSync(path.resolve('pages/api/assistant/stats.js'), 'utf8');
  assert.match(statsApiSrc, /from\('ca_hand_facts'\)\s*\.select\('hand_id'/, 'stats API must select real ca_hand_facts.hand_id column (not phantom id)');
  assert.match(statsApiSrc, /availableClubArenaHands/, 'stats API must expose availableClubArenaHands for Home Analyze My Play state');

  const useAssistantSrc = fs.readFileSync(path.resolve('src/hooks/useAssistant.js'), 'utf8');
  assert.match(useAssistantSrc, /totalSamples:\s*leak\.total_samples/, 'formatLeak must preserve total_samples');
  assert.match(useAssistantSrc, /formatScope:\s*inferLeakFormatScope/, 'formatLeak must classify formatScope');

  const homeSrc = fs.readFileSync(path.resolve('pages/hub/personal-assistant/index.js'), 'utf8');
  assert.doesNotMatch(homeSrc, /reviewsDue/, 'Home must not read dead reviewsDue field');
  assert.doesNotMatch(homeSrc, /dailyHand\.position \|\| 'BTN'/, 'Home must not fabricate BTN when daily hand position is missing');
  assert.doesNotMatch(homeSrc, /\/hub\/training/, 'Home landing body must not redirect to Training Games');

  const leaksSrc = fs.readFileSync(path.resolve('pages/hub/personal-assistant/leaks.js'), 'utf8');
  assert.match(leaksSrc, /if \(!hasExplicitUrlFmt\)/, 'leaks.js must not let localStorage overwrite explicit URL ?format=');
  assert.match(leaksSrc, /<BleedSummary leaks=\{visibleLeaks\}/, 'BleedSummary must receive filtered visibleLeaks');
  assert.match(leaksSrc, /hiddenCrossFormatCount/, 'leaks.js must disclose cross-format leaks hidden by format filter');
  assert.match(leaksSrc, /useModalHistory\(Boolean\(reviewSession\), closeReviewSession\)/, 'leaks.js must trap mobile Back on drill sheet');
  assert.match(leaksSrc, /reviewRecord\?\.retired/, 'LeakDetail honesty check must read reviewRecord.retired');
  assert.doesNotMatch(leaksSrc, /btn\('primary',\s*\{\s*full:\s*true/, 'leaks.js must pass block: true (not unrecognized full: true)');

  const quickDrillSrc = fs.readFileSync(path.resolve('src/components/sandbox/QuickSpotDrill.jsx'), 'utf8');
  assert.match(quickDrillSrc, /if \(!ignoreFilters && reviewLeakId/, 'Try Without Filters must omit leak param');
  assert.match(quickDrillSrc, /timerRestartNonce/, 'QuickSpotDrill must restart timer on repeated identical timeout errors');
  assert.match(quickDrillSrc, /\$\{spotDuration\}/, 'QuickSpotDrill qKey must include spotDuration');

  const coachSrc = fs.readFileSync(path.resolve('src/components/personal-assistant/CoachingWorkspace.jsx'), 'utf8');
  const coachCss = fs.readFileSync(path.resolve('src/components/personal-assistant/CoachingWorkspace.module.css'), 'utf8');
  assert.match(coachSrc, /setLifecycle\(null\)/, 'CoachingWorkspace must reset lifecycle on account switch');
  assert.match(coachSrc, /role="region" aria-label="Solver Coverage Gaps"/, 'Solver Coverage Gaps requires role=region');
  assert.match(coachCss, /\.inlineNotice button \{ min-height: 44px;/, 'CoachingWorkspace inlineNotice button must be >= 44px');
  assert.match(coachCss, /font-size: 16px;/, 'CoachingWorkspace form inputs must be >= 16px to prevent iOS auto-zoom');
});
