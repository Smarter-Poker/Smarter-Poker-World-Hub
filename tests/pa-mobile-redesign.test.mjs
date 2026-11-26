/**
 * Phase 6 Regression Guard: #SmarterDesign Mobile-First Redesign & Second-Audit Hardening
 *
 * Permanently pins:
 *  1. Flat 3-tab navigation (Today / Plan, Leaks, Progress) + single labeled Settings BottomSheet.
 *  2. Home simplification: single dynamic Your Next Step hero CTA, 3-tile stat strip, Daily Hand, ?hand= redirect.
 *  3. Leak list 1+1 card density, fixed-only leak visibility (?status=fixed when 0 active leaks remain),
 *     overflow Inspect Evidence -> initialLeakId handoff, and sharedPayload fetch deduplication.
 *  4. Mobile CSS law compliance: zero banned scroll-snap / scrollbar-width: none / <12px fontSize regressions.
 *  5. Phone thumb-zone flows: QuickSpotDrill sticky answer deck, InlineHandReplay street bar + touch swipe +
 *     unsupported-strategy notice, LiveSpotQuickEntry 2-step wizard.
 *  6. Clean Virtual Sandbox SEO & page copy (no retired URL-sharing / ?spot= claims).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Home page exposes single dynamic next-step hero, 3-tile stat strip, and ?hand= auto-redirect', () => {
  const src = read('pages/hub/personal-assistant/index.js');
  assert.match(src, /router\.query\.hand|query\?\.hand/, 'Home must forward ?hand=<uuid> deep links');
  assert.match(src, /Your Next Step|data-pa-next-step/, 'Home must present a single primary Next Step CTA');
  assert.match(src, /Active Leaks/, 'Home stat strip must show Active Leaks');
  assert.match(src, /Drills Due/, 'Home stat strip must show Drills Due');
  assert.match(src, /Verified Fixed/, 'Home stat strip must show Verified Fixed');
  assert.doesNotMatch(src, /data-pa-sandbox-share/, 'Retired sandbox share controls must stay removed');
});

test('Leaks page consolidates to 3 flat tabs, preserves fixed-only leaks, passes initialLeakId & sharedPayload', () => {
  const src = read('pages/hub/personal-assistant/leaks.js');
  assert.match(src, /Today \/ Plan/, 'Primary nav must label Today / Plan');
  assert.match(src, /activeLeaks\.length === 0 && pastLeaks\.length === 0/,
    'Empty-state branch must not hide resolved leaks when 0 active leaks remain (?status=fixed)');
  assert.match(src, /const \[coachingPayload, setCoachingPayload\] = useState\(null\)/,
    'Parent must hold shared coaching payload to prevent duplicate GET /api/assistant/coaching');
  assert.match(src, /sharedPayload=\{coachingPayload\}/,
    'Parent must pass sharedPayload to CoachingWorkspace');
  assert.match(src, /initialLeakId=\{initialEvidenceLeakId\}/,
    'Parent must pass target leak ID from overflow Inspect Evidence to CoachingWorkspace');
  assert.match(src, /if \(target\?\.id\) setInitialEvidenceLeakId\(target\.id\)/,
    'Inspect Evidence overflow action must record the tapped leak ID');
});

test('CoachingWorkspace consumes sharedPayload, honors initialLeakId, and preserves Weekly Coaching Report heading', () => {
  const src = read('src/components/personal-assistant/CoachingWorkspace.jsx');
  assert.match(src, /sharedPayload\s*=\s*null/, 'CoachingWorkspace must accept sharedPayload prop');
  assert.match(src, /initialLeakId\s*=\s*null/, 'CoachingWorkspace must accept initialLeakId prop');
  assert.match(src, /onPayloadUpdated\s*=\s*null/, 'CoachingWorkspace must notify parent on refresh');
  assert.match(src, /Weekly Coaching Report/, 'Weekly Coaching Report heading must be preserved');
});

test('PA mobile stylesheets contain zero banned horizontal-scroll or scrollbar-hiding rules', () => {
  for (const cssPath of [
    'src/styles/worlds/PersonalAssistantTools.module.css',
    'src/components/personal-assistant/CoachingWorkspace.module.css',
    'src/styles/worlds/PersonalAssistantHub.module.css',
  ]) {
    const css = read(cssPath);
    assert.doesNotMatch(css, /scroll-snap-type/, `${cssPath} must not use scroll-snap-type`);
    assert.doesNotMatch(css, /scrollbar-width\s*:\s*none/, `${cssPath} must not hide scrollbars`);
    assert.doesNotMatch(css, /::-webkit-scrollbar\s*\{\s*display\s*:\s*none/, `${cssPath} must not hide webkit scrollbars`);
  }
});

test('Phone-first components enforce >=12px text, thumb-zone controls, touch swipe, and strategy-support boundary', () => {
  const replay = read('src/components/personal-assistant/InlineHandReplay.jsx');
  assert.doesNotMatch(replay, /fontSize\s*:\s*(?:[1-9]|10|11)\b/, 'InlineHandReplay must not use <12px font sizes');
  assert.match(replay, /onTouchStart/, 'InlineHandReplay must support touch swipe between streets');
  assert.match(replay, /strategySupported\s*===\s*false/, 'InlineHandReplay must clearly display strategy-unsupported notice');

  const drill = read('src/components/sandbox/QuickSpotDrill.jsx');
  assert.match(drill, /position\s*:\s*['"]sticky['"]|bottom\s*:\s*0/, 'QuickSpotDrill must keep answer buttons in thumb zone');

  const entry = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');
  assert.match(entry, /step|Step 1|Step 2/i, 'LiveSpotQuickEntry must guide mobile players through a 2-step flow');
});

test('Virtual Sandbox SEO and feature copy do not advertise retired URL sharing', () => {
  const seo = read('src/lib/seo/markdownIngestion.mjs');
  const feature = read('pages/features/virtual-poker-sandbox.js');
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');

  for (const [label, text] of [
    ['markdownIngestion.mjs', seo],
    ['virtual-poker-sandbox.js', feature],
    ['sandbox.js', sandbox],
  ]) {
    assert.doesNotMatch(text, /share(?:\s+the)?\s+(?:sandbox\s+)?url|\?spot=/i, `${label} must not claim retired sandbox URL sharing`);
  }
});
