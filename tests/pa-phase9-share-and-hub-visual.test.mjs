/**
 * Phase 9 Regression Guard: Share Hand, Personal Assistant Hub, Sandbox Boundary & Virtual Sandbox Lander
 *
 * Permanently verifies 100% hard-coded #SmarterDesign graphics, motion, contrast, and ergonomics upgrades:
 *  1. pages/share/hand.js: #SmarterDesign obsidian-navy canvas, 100dvh, overflowX: clip, safe-area bottom inset,
 *     semantic <main> + <h1>, >=7.5:1 #9eb4c8 contrast on footer & Vs divider, deduplicated PlayingCard with
 *     high-contrast 4-color suits, cached SSR imgRef.current?.complete check + imageError fallback, royal-blue
 *     CTAs with hover/active/focus-visible & prefers-reduced-motion guards, plus all OG & view=review invariants.
 *  2. pages/hub/personal-assistant/index.js & PersonalAssistantHub.module.css: GPU-composited opacity skeleton pulse,
 *     reduced-motion-guarded connected .statusDot pulse, composited hover + tactile :active scale(0.985) across all
 *     interactive triggers, tactile .playingCard/.boardCard sheen + 'T' -> '10' formatting, removal of 11 dead CSS
 *     classes, and [Personal Assistant]-tagged console warnings.
 *  3. pages/hub/personal-assistant/sandbox.js: :hover, :active scale(0.985) under prefers-reduced-motion: no-preference,
 *     :focus-visible 2px solid #83deff, and rotating chevron on .summary-disclosure > summary and .destination.
 *  4. pages/features/virtual-poker-sandbox.js: >=12px font-size override on citation/permalink controls, 44px hero CTAs,
 *     :focus-visible 2px solid #83deff outline, and 'Zero Download WebGL Engine' + 'In The Sandbox?' copy fixes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('1. pages/share/hand.js enforces #SmarterDesign obsidian-navy theme, semantic landmarks, contrast, PlayingCard, imgRef cache fix, and royal-blue CTAs', () => {
  const src = read('pages/share/hand.js');

  // Obsidian-navy canvas, 100dvh, overflowX: clip, safe-area inset, and zero legacy purple/gold
  assert.match(src, /linear-gradient\(180deg,\s*#05080c 0%,\s*#040d18 48%,\s*#020407 100%\)/);
  assert.match(src, /minHeight:\s*'100dvh'/);
  assert.match(src, /overflowX:\s*'clip'/);
  assert.match(src, /paddingBottom:\s*'max\(24px,\s*env\(safe-area-inset-bottom\)\)'/);
  assert.doesNotMatch(src, /minHeight:\s*'100vh'/);
  assert.doesNotMatch(src, /#0a0a1e|#1a1a3e|#FFD700|#FFA500/i);

  // Semantic <main> landmark and <h1> heading
  assert.match(src, /<main[\s\S]*className="share-hand-page"/);
  assert.match(src, /<h1\s+style=/);

  // Contrast fixes (#9eb4c8 on footer and Vs divider, no low-contrast rgba(255,255,255,0.2/0.3))
  assert.doesNotMatch(src, /rgba\(255,\s*255,\s*255,\s*0\.[23]\)/);
  assert.match(src, /color:\s*'#9eb4c8'[\s\S]{0,60}>Vs<\/div>/);
  assert.match(src, /color:\s*'#9eb4c8'[\s\S]{0,120}The #1 Poker Intelligence Platform/);

  // Deduplicated PlayingCard component with 4-color high-contrast suits
  assert.match(src, /const SUIT_COLORS = \{\s*c:\s*'#4DE0A5',\s*d:\s*'#56D8FF',\s*h:\s*'#FF6B7A',\s*s:\s*'#F1F5FC'\s*\}/);
  assert.match(src, /function PlayingCard\(\{\s*card,\s*variant\s*=\s*'hero'\s*\}\)/);
  const playingCardUses = src.match(/<PlayingCard\b/g) || [];
  assert.equal(playingCardUses.length, 4, 'Hero and Board card strips in review and standard views must reuse PlayingCard');

  // Cached SSR image load check via imgRef.current?.complete + imageError fallback
  assert.match(src, /const imgRef = useRef\(null\)/);
  assert.match(src, /if \(imgRef\.current\?\.complete\)/);
  assert.match(src, /const \[imageError, setImageError\] = useState\(false\)/);
  assert.match(src, /data-testid="share-image-fallback"/);

  // Royal-blue primary CTA & scoped interactive / reduced-motion styles
  assert.match(src, /linear-gradient\(180deg,\s*#087cfa 0%,\s*#0044ac 55%,\s*#002b68 100%\)/);
  assert.match(src, /border:\s*'1px solid #56d8ff'/);
  assert.match(src, /borderTopColor:\s*'#b3eaff'/);
  assert.match(src, /transform:\s*scale\(0\.985\)/);
  assert.match(src, /outline:\s*2px solid #83deff/);
  assert.match(src, /@media \(prefers-reduced-motion: reduce\)/);
});

test('2. PersonalAssistantHub.module.css and index.js use GPU opacity skeleton pulse, statusDot pulse, tactile transitions, 10-rank formatting, and zero dead classes', () => {
  const css = read('src/styles/worlds/PersonalAssistantHub.module.css');
  const home = read('pages/hub/personal-assistant/index.js');

  // GPU-composited opacity skeleton pulse (0.42 -> 0.85 -> 0.42), zero background-position animation
  assert.doesNotMatch(css, /background-position/);
  assert.match(css, /@keyframes pa-skel\s*\{\s*0%,\s*100%\s*\{\s*opacity:\s*0\.42;\s*\}\s*50%\s*\{\s*opacity:\s*0\.85;\s*\}\s*\}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.skelBlock\s*\{\s*animation:\s*none;/);

  // Connected live status pulse on .statusDot
  assert.match(css, /\.statusBadge:not\(\.statusWarning\)\s+\.statusDot\s*\{\s*animation:\s*pa-status-pulse/);
  assert.match(css, /@keyframes pa-status-pulse/);

  // Smooth composited hover + tactile :active scale(0.985) across all interactive triggers
  for (const selector of [
    '.tabs :is(a, button)',
    '.primaryButton',
    '.secondaryButton',
    '.statCard',
    '.loopStep',
    '.systemCardTrigger',
    '.liveSpotTrigger',
    '.sessionRow',
    '.disclosure > summary',
  ]) {
    assert.ok(css.includes(selector), `Expected ${selector} in interactive transition list`);
  }
  assert.match(css, /transform:\s*scale\(0\.985\)/);

  // Tactile card elevation/sheen + crisp suit contrast + 'T' -> '10' formatting
  assert.match(css, /\.playingCard,\s*\.boardCard\s*\{[\s\S]{0,260}border-top-color:\s*#ffffff;/);
  assert.match(css, /\.redCard\s*\{\s*color:\s*#b8142c;\s*\}/);
  assert.match(home, /const rank = rawRank === 'T' \? '10' : rawRank;/);

  // Confirmed unused CSS classes removed
  for (const deadClass of [
    'loadingWrap',
    'loadingText',
    'heroMetaRow',
    'heroActions',
    'statAction',
    'activityGrid',
    'activityCard',
    'activityCardInner',
    'activityIcon',
    'activityContent',
    'activityChevron',
  ]) {
    assert.doesNotMatch(css, new RegExp(`\\.${deadClass}\\b`), `Dead CSS class .${deadClass} must be removed`);
  }

  // Generic [App] Handled exception logs cleaned and tagged as [Personal Assistant]
  assert.doesNotMatch(home, /\[App\] Handled exception/);
  assert.match(home, /\[Personal Assistant\] Session refresh error:/);
  assert.match(home, /\[Personal Assistant\] Stats refresh error:/);
});

test('3. pages/hub/personal-assistant/sandbox.js adds hover, reduced-motion active scale, focus-visible, and rotating disclosure chevron', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');

  assert.match(sandbox, /\.destination:hover/);
  assert.match(sandbox, /\.summary-disclosure > summary:hover/);
  assert.match(sandbox, /\.summary-disclosure > summary:focus-visible[\s\S]*outline:\s*2px solid #83deff/);
  assert.match(sandbox, /\.summary-disclosure > summary::after/);
  assert.match(sandbox, /\.summary-disclosure\[open\] > summary::after\s*\{\s*transform:\s*rotate\(225deg\);\s*\}/);
  assert.match(sandbox, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*transform:\s*scale\(0\.985\)/);
});

test('4. pages/features/virtual-poker-sandbox.js enforces >=12px button/link text, 44px hero CTAs, focus-visible outline, and WebGL/Title Case copy', () => {
  const feature = read('pages/features/virtual-poker-sandbox.js');

  assert.match(feature, /Zero Download WebGL Engine/);
  assert.doesNotMatch(feature, /Zero Download Web GL Engine/);
  assert.match(feature, /Can I Run Multiway All-In Scenarios In The Sandbox\?/);
  assert.doesNotMatch(feature, /Can I Run Multiway All-In Scenarios in The Sandbox\?/);
  assert.match(feature, /\.virtual-sandbox-lander header a\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(feature, /\.virtual-sandbox-lander button,[\s\S]*font-size:\s*12px\s*!important/);
  assert.match(feature, /\.virtual-sandbox-lander a:focus-visible,\s*\.virtual-sandbox-lander button:focus-visible\s*\{\s*outline:\s*2px solid #83deff;\s*outline-offset:\s*2px;\s*\}/);
});
