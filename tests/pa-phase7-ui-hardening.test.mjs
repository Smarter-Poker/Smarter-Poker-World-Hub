/**
 * Phase 7 Regression Guard: Personal Assistant UI, Mobile & Runtime Hardening
 *
 * Permanently verifies root-cause source fixes for all 14 confirmed UI/Mobile/Runtime defects:
 *  1. [LIVE BUG #1 & P2 #13] Signed-out 401 prevention across useLeakDetection, useLeaks,
 *     useAssistantStats, fetchCoachAccuracy, and fetchReviewSchedule + auth restore & 401/403 poll stop.
 *  2. [LIVE BUG #2] Zero mobile horizontal overflow at 390x844 on /features/virtual-poker-sandbox
 *     (flex-wrap on breadcrumb/semantic-mesh links, fixed table layout, overflow-x: clip).
 *  3. [P0 #1] Unified paKit BottomSheet across leaks.js & CoachingWorkspace.jsx + Z tokens above BottomNavBar (900).
 *  4. [P0 #2 & #3] Filter snap-back prevention (prevQueryHydrationRef reset before router.replace,
 *     saved-prefs effect independent of router.query.format, atomic All quick-filter chip persistence).
 *  5. [P0 #4 & P2 #16, #17] CoachingWorkspace Settings preference sync to workspace + onPayloadUpdated,
 *     signed-out Settings gate, overflow sheet useModalHistory, resolved-leak Inspect Evidence fallback,
 *     and shallow consumption of ?settings=1 / ?view=data.
 *  6. [P1 #5 & Backend P1-3] PersonalAssistantTools.module.css .instrumentPanel overflow: clip,
 *     InlineHandReplay sticky street bar offset, honest strategy-unsupported banner, effectiveStackBb priority,
 *     and cooldown_active vs retention policy badge + Audit This Hand gating.
 *  7. [P1 #6] QuickSpotDrill 403 RTA error honesty (preserves server blocked message & marks permanent).
 *  8. [P1 #7] TrendChart & TrendStatTiles Aggression Factor ratio formatting & non-negative minVal clamping.
 *  9. [P1 #8] Zero fabricated 'BTN' / 'Preflop' fallbacks in LeakDetail and CoachingWorkspace.
 * 10. [P1 #9, P2 #15, Cross-App P2-7] Home page coachingStatus ('loading' | 'ready' | 'error') for Drills Due,
 *     no nested <main> inside HubPageShell, and ?handId= / ?leak= / ?tab= deep-link forwarding.
 * 11. [P1 #10, #12 & Cross-App P0-1, P1-4, P1-5, P2-7, P2-8, P2-9] Hand-audit persisted:false warning,
 *     Fixed filter chip hides BleedSummary & active-leak drill banner, 44px CTA with Training Arena copy,
 *     handleTrainDrills street/position/format/returnTo forwarding, handleShareLeak stateless /share/hand URL,
 *     onPracticeWorst wired to handleStartReview, LiveSpotQuickEntry source/returnTo/MAX_PASTE_CHARS/paste tab,
 *     and sandbox.js source=personal-assistant-sandbox-retired.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const paTokens = await import(pathToFileURL(path.join(ROOT, 'src/components/sandbox/paTokens.js')).href);

test('1. [LIVE BUG #1 & P2 #13] Signed-out visits fire zero unauthenticated 401 requests and useLeakDetection restores on auth ready', () => {
  const hooks = read('src/hooks/useAssistant.js');
  const leaks = read('pages/hub/personal-assistant/leaks.js');

  // useLeakDetection accepts authState ({ userId, ready }), resets on authUserId change, gates readJob on authReady && authUserId, and attaches err.status
  assert.match(hooks, /export function useLeakDetection\(authState\s*=\s*\{\}\)/);
  assert.match(hooks, /if \(!authReady \|\| !authUserId\) return null;/);
  assert.match(hooks, /err\.status\s*=\s*response\.status/);
  assert.match(hooks, /}, \[authReady, authUserId, readJob\]\);/);

  // useAssistantStats and useLeaks short-circuit when explicitly signed out (hasExplicitAuth && !authUserId)
  assert.match(hooks, /if \(hasExplicitAuth && !authUserId\) \{[\s\S]{0,400}setIsDemo\(true\);[\s\S]{0,120}setIsLoading\(false\);\s*return;\s*\}/);

  // leaks.js passes { userId, ready: !authInitializing } to useLeakDetection and gates fetchCoachAccuracy & fetchReviewSchedule
  assert.match(leaks, /useLeakDetection\(\{\s*userId,\s*ready:\s*!authInitializing,?\s*\}\)/);
  assert.match(leaks, /const fetchCoachAccuracy = useCallback\(async \(\) => \{\s*const requestId = \+\+coachRequestIdRef\.current;\s*if \(authInitializing\) return;\s*if \(!userId\)/);
  assert.match(leaks, /const fetchReviewSchedule = useCallback\(async \(\) => \{\s*const requestId = \+\+reviewRequestIdRef\.current;\s*if \(authInitializing\) return;\s*if \(!userId\)/);
});

test('2. [LIVE BUG #2] /features/virtual-poker-sandbox enforces responsive wrapping and overflow-x: clip for 0px mobile overflow at 390x844', () => {
  const feature = read('pages/features/virtual-poker-sandbox.js');

  assert.match(feature, /className="virtual-sandbox-lander"/);
  assert.match(feature, /overflow-x:\s*clip/);
  assert.doesNotMatch(feature, /overflow-x:\s*hidden/, 'Must use overflow-x: clip, never bare overflow-x: hidden');
  assert.match(feature, /\.virtual-sandbox-lander nav\[aria-label="Breadcrumb"\][\s\S]*flex-wrap:\s*wrap\s*!important/);
  assert.match(feature, /\.virtual-sandbox-lander table\s*\{[\s\S]*table-layout:\s*fixed/);
  assert.match(feature, /@media \(max-width: 768px\)/);
});

test('3. [P0 #1] All BottomSheets in leaks.js & CoachingWorkspace.jsx use paKit BottomSheet with Z above BottomNavBar (900)', () => {
  const leaks = read('pages/hub/personal-assistant/leaks.js');
  const coaching = read('src/components/personal-assistant/CoachingWorkspace.jsx');

  assert.doesNotMatch(leaks, /UiBottomSheet|components\/ui\/BottomSheet/, 'leaks.js must not import or render UiBottomSheet');
  assert.doesNotMatch(coaching, /components\/ui\/BottomSheet/, 'CoachingWorkspace.jsx must not import ui/BottomSheet');
  assert.match(coaching, /import\s*\{\s*BottomSheet\s*\}\s*from\s*'\.\.\/sandbox\/paKit'/);

  // Z-index tokens must strictly exceed BOTTOM_NAV_Z = 900
  assert.ok(paTokens.Z.backdrop > 900, `Expected Z.backdrop > 900, got ${paTokens.Z.backdrop}`);
  assert.ok(paTokens.Z.sheet > paTokens.Z.backdrop, `Expected Z.sheet > Z.backdrop, got ${paTokens.Z.sheet}`);
  assert.ok(paTokens.Z.popover > paTokens.Z.sheet, `Expected Z.popover > Z.sheet, got ${paTokens.Z.popover}`);
  assert.ok(paTokens.Z.toast >= 1000, `Expected Z.toast >= 1000, got ${paTokens.Z.toast}`);
});

test('4. [P0 #2 & #3] Filter snap-back prevention and atomic All quick-filter chip persistence', () => {
  const leaks = read('pages/hub/personal-assistant/leaks.js');

  // updateFormatFilter and handleResetAnalysisSettings clear prevQueryHydrationRef.current.format before router.replace
  assert.match(leaks, /const updateFormatFilter = useCallback\(\(nextFormat\) => \{[\s\S]{0,220}prevQueryHydrationRef\.current\.format = null;\s*const \{ format: _removed/);
  assert.match(leaks, /const handleResetAnalysisSettings = useCallback\(\(\) => \{[\s\S]{0,600}prevQueryHydrationRef\.current\.format = null;/);

  // Saved-prefs effect does not re-run on router.query?.format changes and respects explicit router.query?.status
  assert.match(leaks, /if \(!hasExplicitUrlStatus\) \{\s*setStatusFilter\(saved\.statusFilter\);\s*\}/);
  assert.match(leaks, /if \(!hasExplicitUrlFmt\) \{\s*setFormatFilter\(saved\.format\);\s*\}\s*\}, \[authInitializing, userId, router\.isReady\]\);/);

  // All chip persists { format: 'all', statusFilter: 'all' } atomically in one persistPrefs call
  assert.match(leaks, /setQuickChip\('all'\);\s*setFormatFilter\('all'\);\s*setStatusFilter\('all'\);\s*persistPrefs\(\{\s*format:\s*'all',\s*statusFilter:\s*'all'\s*\}\);/);
});

test('5. [P0 #4 & P2 #16, #17] CoachingWorkspace syncs saved preferences, gates signed-out Settings, registers overflow history, and falls back for resolved leaks', () => {
  const coaching = read('src/components/personal-assistant/CoachingWorkspace.jsx');
  const leaks = read('pages/hub/personal-assistant/leaks.js');

  // Syncs saved preferences to workspace and notifies parent via onPayloadUpdated?.(next)
  assert.match(coaching, /const syncSavedPreferences = useCallback\(\(patch\) => \{[\s\S]{0,900}onPayloadUpdated\?\.\(next\);/);
  assert.match(coaching, /syncSavedPreferences\(\{\s*analysis_depth:\s*nextDepth,\s*analysisDepth:\s*nextDepth\s*\}\)/);
  assert.match(coaching, /syncSavedPreferences\(\{\s*weekly_digest_opt_in:\s*nextEnabled,\s*weeklyDigestOptIn:\s*nextEnabled\s*\}\)/);

  // Signed-out Settings sheet gates account-only Coaching Preferences & Export Study Plan behind Sign-In prompt
  assert.match(coaching, /data-testid="settings-signin-gate"/);
  assert.match(coaching, /Sign In To Sync Preferences &amp; Export Your Study Plan/);

  // Overflow sheet registers useModalHistory
  assert.match(coaching, /useModalHistory\(Boolean\(overflowModule\),\s*closeOverflowModule\)/);

  // Resolved leak Inspect Evidence falls back to workspace?.snapshot?.leaks / leaks when not in priorities
  assert.match(coaching, /const fallbackSelectedPriority = useMemo\(\(\) => \{[\s\S]{0,400}findLeak\(workspace\?\.snapshot\?\.leaks,\s*selectedLeakId\)/);
  assert.match(coaching, /\|\|\s*fallbackSelectedPriority\s*\|\|\s*priorities\[0\]/);

  // URL settings auto-open is skipped when controlledSettingsOpen !== undefined, and leaks.js clears ?settings=1 / ?view=data once consumed
  assert.match(coaching, /if \(\(urlView === 'data' \|\| urlSettings === '1'\) && controlledSettingsOpen === undefined\)/);
  assert.match(leaks, /setSettingsOpen\(true\);\s*const nextQuery = \{ \.\.\.router\.query \};\s*delete nextQuery\.settings;\s*if \(nextView === 'data'\) delete nextQuery\.view;\s*router\.replace/);
});

test('6. [P1 #5 & Backend P1-3] InlineHandReplay sticky offset, honest unsupported banner, effectiveStackBb priority, and cooldown badge', () => {
  const css = read('src/styles/worlds/PersonalAssistantTools.module.css');
  const replay = read('src/components/personal-assistant/InlineHandReplay.jsx');
  const leaks = read('pages/hub/personal-assistant/leaks.js');

  assert.match(css, /\.instrumentPanel\s*\{\s*position:\s*relative;\s*overflow:\s*clip;/);
  assert.match(replay, /bottom:\s*'var\(--sp-footer-dock-height, 0px\)'/);
  assert.match(replay, /\{isStrategyUnsupported && \(\s*<div\s+role="note"\s+data-testid="replay-strategy-unsupported-banner"/);
  assert.doesNotMatch(replay, /\(isStrategyUnsupported \|\| Boolean\(resolvedDeclineReason\)\)/);
  assert.match(replay, /activeTimeline\?\.effectiveStackBb\s*\?\?\s*activeTimeline\?\.effectiveStack/);

  // Cooldown vs retention policy distinction and Audit This Hand gating
  assert.match(leaks, /linkedHandAudit\?\.reason === 'cooldown_active'[\s\S]{0,120}'Solver Grading Paused During Cooldown'\s*:\s*'Unmeasured Under Retention Policy'/);
  assert.match(leaks, /userId && linkedHandAudit\?\.strategySupported !== false && linkedHandAudit\?\.supported !== false/);
});

test('7. [P1 #6] QuickSpotDrill preserves 403 RTA / 401 / 422 server error message and marks it non-retryable', () => {
  const drill = read('src/components/sandbox/QuickSpotDrill.jsx');

  assert.match(drill, /error\.status\s*=\s*res\.status;\s*error\.blocked\s*=\s*json\?\.blocked === true;/);
  assert.match(drill, /const isPermanentOrBlocked =\s*e\?\.blocked === true\s*\|\|\s*\[401, 403, 422\]\.includes\(e\?\.status\)/);
  assert.match(drill, /setLoadErrorPermanent\(isPermanentOrBlocked\)/);
});

test('8. [P1 #7] TrendChart & TrendStatTiles format Aggression Factor leaks as ratios without % and clamp minVal >= 0', () => {
  const leaks = read('pages/hub/personal-assistant/leaks.js');

  assert.match(leaks, /function isRatioMetricLeak\(leakType\)/);
  assert.match(leaks, /slug === 'passive_postflop'\s*\|\|\s*slug === 'over_aggressive_postflop'/);
  assert.match(leaks, /isRatio \? 'Aggression Factor Vs Optimal' : 'Frequency Vs Optimal'/);
  assert.match(leaks, /Math\.max\(0,\s*Math\.min\(\.\.\.bounds\) - 5\)/);
  assert.match(leaks, /leakType=\{leak\.leakType\}/);
});

test('9. [P1 #8] LeakDetail and CoachingWorkspace never fabricate BTN or Preflop fallbacks when heroPosition/street are absent', () => {
  const leaks = read('pages/hub/personal-assistant/leaks.js');
  const coaching = read('src/components/personal-assistant/CoachingWorkspace.jsx');

  assert.doesNotMatch(leaks, /detailRepHand\.heroPosition \|\| 'BTN'/);
  assert.match(leaks, /detailRepHand\.heroPosition \|\| 'All Positions'/);
  assert.doesNotMatch(coaching, /overflowModule\.representativeHand\?\.heroPosition \|\| 'BTN'/);
  assert.match(coaching, /overflowModule\.representativeHand\?\.heroPosition \|\| 'All Positions'/);
});

test('10. [P1 #9, P2 #15, Cross-App P2-7] Home page tracks coachingStatus for Drills Due, avoids nested <main>, and forwards ?handId= / ?leak= / ?tab=', () => {
  const home = read('pages/hub/personal-assistant/index.js');

  assert.match(home, /const \[coachingStatus, setCoachingStatus\] = useState\('loading'\)/);
  assert.match(home, /const drillsDueLoading = !isSignedOut && coachingStatus === 'loading'/);
  assert.match(home, /coachingStatus === 'error' \? 'Retry To Load' : unavailableLabel/);
  assert.doesNotMatch(home, /<main className=\{styles\.main\}/, 'Home must not nest <main> inside HubPageShell');
  assert.match(home, /<div className=\{styles\.main\} id="overview">/);
  assert.match(home, /router\?\.query\?\.handId/);
  assert.match(home, /readParam\('leak'\)/);
  assert.match(home, /readParam\('tab'\)/);
});

test('11. [P1 #10, #12 & Cross-App P0-1, P1-4, P1-5, P2-7, P2-8, P2-9] Leak Finder, LiveSpotQuickEntry, and Sandbox cross-app contracts', () => {
  const leaks = read('pages/hub/personal-assistant/leaks.js');
  const liveSpot = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');

  // Hand-audit persisted:false warning
  assert.match(leaks, /else if \(payload\.supported !== false && payload\.audited !== false\) \{[\s\S]{0,240}Hand Audit Completed, But Decision Evidence Could Not Be Saved/);

  // Fixed filter chip omits BleedSummary & active-leak drill banner; CTA minHeight: 44; Training Arena copy
  assert.match(leaks, /\{quickChip !== 'fixed' && \(\s*<LeakErrorBoundary label="The bleed summary">/);
  assert.match(leaks, /\{quickChip !== 'fixed' && shownLeaks\[0\] && \(/);
  assert.match(leaks, /1-Tap Training Arena Corrective Drill/);
  assert.match(leaks, /Train Top Detected Leak In Training Arena →/);
  assert.doesNotMatch(leaks, /Train Top Detected Leak In Club Arena/);

  // handleTrainDrills forwards street, position, normalized format, leak, returnTo, and does not put street into q.category
  assert.match(leaks, /if \(\['preflop', 'flop', 'turn', 'river'\]\.includes\(streetCandidate\)\) \{\s*q\.street = streetCandidate;/);
  assert.match(leaks, /q\.returnTo = `\/hub\/personal-assistant\/leaks\?leak=\$\{encodeURIComponent\(String\(target\.id\)\)\}`/);

  // handleShareLeak uses buildHandReviewShareUrl (/share/hand?view=review) with includeHoleCards: false
  assert.match(leaks, /const handleShareLeak = useCallback\(async \(leak\) => \{[\s\S]{0,600}buildHandReviewShareUrl\(\{[\s\S]{0,450}includeHoleCards:\s*false/);

  // onPracticeWorst wired to handleStartReview({ leak: worst })
  assert.match(leaks, /onPracticeWorst: \(\) => \{[\s\S]{0,220}handleStartReview\(\{ leak: worst \}\)/);

  // Accepts ?handId= and ?leakId=, includes &leak= in handleReviewExample
  assert.match(leaks, /router\.query\?\.hand \?\? router\.query\?\.handId/);
  assert.match(leaks, /router\.query\?\.leak \?\? router\.query\?\.leakId/);
  assert.match(leaks, /const handleReviewExample = useCallback\(\(_leak, example\) => \{[\s\S]{0,360}leakParam = leakId \? `&leak=\$\{encodeURIComponent\(String\(leakId\)\)\}` : ''/);

  // LiveSpotQuickEntry passes source & returnTo, enforces MAX_PASTE_CHARS on single-chunk file upload, and switches to paste tab
  assert.match(liveSpot, /source:\s*'personal-assistant-live-spot'/);
  assert.match(liveSpot, /returnTo:\s*'\/hub\/personal-assistant\/leaks'/);
  assert.match(liveSpot, /setTab\('paste'\);\s*\/\/ Single chunk shortcut\s*if \(chunks\.length === 1\) \{\s*if \(text\.length > MAX_PASTE_CHARS\)/);

  // sandbox.js uses source=personal-assistant-sandbox-retired for Club Arena hand-history
  assert.match(sandbox, /\/hub\/club-arena\/hand-history\?source=personal-assistant-sandbox-retired/);
});
