/**
 * Phase 9 Regression Guard: Leak Finder & Coaching Workspace Visual,
 * Graphic, Animation, Cascade & Ergonomics Hardening.
 *
 * Permanently verifies:
 *  1. [pages/hub/personal-assistant/leaks.js]
 *     - Signed-out prompt deduplication (`userId && leaksAreDemo && !leaksLoading`) & unified American "Analyze" spelling.
 *     - Explicit `fontSize: 12` on `<small>` inside `Stats & Audit Details`, `Analysis Settings`, and `ShareReviewControl` disclosures.
 *     - Royal-blue default active pill for `Status -> All` (`tone={statusFilter === 'persistent' ? 'warn' : 'accent'}`).
 *     - Clean single-plus `<span>Add / Audit Hands</span>` label next to `<Plus />` icon.
 *     - Visible search focus ring (`.leak-search-wrap:focus-within { border-color: #56d8ff; outline: 2px solid #83deff; outline-offset: 1px; }`).
 *     - Removal of 72px duplicate bottom clearance (`paddingBottom: 'max(18px, env(safe-area-inset-bottom, 0px))'`).
 *     - Desktop (`1440x900`) breathing room (`@media (min-width: 769px)` `.leaks-shell { max-width: 820px !important; }`).
 *     - Upgraded `TrendChart` SVG graphics (`<defs><linearGradient>`, active point outer halo ring, clickable SVG dots, `.toFixed(1)` aria-label).
 *     - GPU-composited progress & frequency bars (`transform: scaleX(...)`) and `AutoGuidanceToggle` switch transitions guarded by `@media (prefers-reduced-motion: no-preference)`.
 *     - Crisp 4-color mini card chips (`c: '#4DE0A5'`, `d: '#56D8FF'`, `h: '#FF6B7A'`, `s: '#F1F5FC'`) using `<span>` only inside `<button>`.
 *     - Cleanup: `pill('neutral')` (zero `pill('muted')`), `accentColor: '#087cfa'` on `ShareReviewControl` checkboxes, `aria-hidden="true"` on decorative Lucide icons, and removal of dead `pageHeader`/`pageTitle`/`pageSub` styles.
 *  2. [CoachingWorkspace.module.css & CoachingWorkspace.jsx]
 *     - Mobile `.dangerPanel` cascade fix (`.panel:not(.dangerPanel)` inside `@media (max-width: 600px)`).
 *     - `.searchBar:focus-within` keyboard focus indicator.
 *     - `:focus-visible`, `:hover`, `:active` (`transform: scale(0.985)` under `prefers-reduced-motion: no-preference`), and `:disabled` styling across interactive controls + composited transition on `.progressTrack span`.
 *     - Removal of unused `.hairlineSection` while keeping `.viewNav` & `.activeView` and zero `#9aabba`.
 *     - Rounded `{Math.round(bounded)}%` in `Progress`, `Number(rate.toFixed(1))` mistake rate formatting, `accentColor: '#087cfa'` on Weekly Coaching Digest checkbox, and screen-reader-only `pa-vh` live region for `Copied Harvest Queue`.
 *  3. [PersonalAssistantTools.module.css]
 *     - `:hover` (`border-color: rgba(86, 216, 255, 0.55); color: #ffffff;`) + reduced-motion-guarded `transition` on `.filterChip` and `.filterMoreBtn`.
 *     - Removal of unused `.sandboxHero` and `.sectionRail` while preserving `.instrumentPanel { position: relative; overflow: clip; }`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('1. [leaks.js] Signed-out prompt deduplication, American Analyze spelling, 12px disclosure <small>, royal-blue Status->All, and single-plus Add/Audit CTA', () => {
  const leaks = read('pages/hub/personal-assistant/leaks.js');

  // Sample-data banner only renders when a signed-in user is viewing demo leaks
  assert.match(leaks, /\{userId && leaksAreDemo && !leaksLoading && \(/);
  assert.doesNotMatch(leaks, /\bAnalyse\b|\bAnalysed\b|\banalyse\b|\banalysed\b/, 'Must unify American Analyze/Analyzed spelling everywhere in leaks.js');
  assert.match(leaks, /label="Hands analyzed"/);
  assert.match(leaks, /text: `Analyzed \$\{num\(result\.handsAnalyzed\)\.toLocaleString\(\)\} Hands/);

  // Explicit 12px on disclosure summary <small> status labels
  assert.match(leaks, /<span>Stats &amp; Audit Details<\/span>\s*<small style=\{\{ fontSize: 12 \}\}>/);
  assert.match(leaks, /<span>Analysis Settings<\/span>\s*<small style=\{\{ fontSize: 12 \}\}>/);
  assert.match(leaks, /<span>Share Review<\/span>\s*<small style=\{\{ fontSize: 12 \}\}>Read-Only Link<\/small>/);

  // Status segmented controls use royal-blue accent for All and warn only for Persistent
  const statusToneMatches = leaks.match(/tone=\{statusFilter === 'persistent' \? 'warn' : 'accent'\}/g) || [];
  assert.equal(statusToneMatches.length, 2, 'Both Analysis Settings and Filters sheet Status segmented controls must use accent for All and warn for Persistent');

  // Single-plus Add / Audit Hands button label next to <Plus /> icon
  assert.match(leaks, /<Plus size=\{18\} strokeWidth=\{2\.2\} aria-hidden="true" \/>\s*<span>Add \/ Audit Hands<\/span>/);
  assert.doesNotMatch(leaks, /<span>\+ Add \/ Audit Hands<\/span>/);
});

test('2. [leaks.js] Search focus ring, bottom clearance deduplication, 820px desktop shell, TrendChart SVG upgrades, GPU progress bars, 4-color mini cards, and cleanup', () => {
  const leaks = read('pages/hub/personal-assistant/leaks.js');

  // Search focus ring
  assert.match(leaks, /<div className="leak-search-wrap" style=\{styles\.searchWrap\}>/);
  assert.match(leaks, /\.leak-search-wrap:focus-within\s*\{\s*border-color:\s*#56d8ff;\s*outline:\s*2px solid #83deff;\s*outline-offset:\s*1px;\s*\}/);

  // Remove 72px duplicate bottom clearance & widen desktop shell to 820px
  assert.match(leaks, /paddingBottom:\s*'max\(18px, env\(safe-area-inset-bottom, 0px\)\)'/);
  assert.doesNotMatch(leaks, /paddingBottom:\s*'calc\(72px/);
  assert.match(leaks, /@media \(min-width: 769px\)\s*\{\s*\.leaks-shell\s*\{\s*max-width:\s*820px !important;/);

  // TrendChart SVG linearGradient, active outer halo ring, clickable dots, and .toFixed(1) aria-label
  assert.match(leaks, /<defs>\s*<linearGradient id=\{`trend-area-grad-\$\{status \|\| 'emerging'\}`\}/);
  assert.match(leaks, /fill=\{`url\(#trend-area-grad-\$\{status \|\| 'emerging'\}\)`\}/);
  assert.match(leaks, /Latest \$\{points\[points\.length - 1\]\.value\.toFixed\(1\)\} percent\./);
  assert.match(leaks, /\{isPointActive && \(\s*<circle[\s\S]{0,200}r=\{11\}/);
  assert.match(leaks, /setActiveIdx\(isPointActive \? null : i\)/);

  // GPU-composited progress bars & reduced-motion guards
  assert.match(leaks, /className="leak-progress-fill"/);
  assert.match(leaks, /transform:\s*`scaleX\(\$\{ratio\}\)`/);
  assert.match(leaks, /transform:\s*`scaleX\(\$\{selPct \/ 100\}\)`/);
  assert.match(leaks, /transform:\s*`scaleX\(\$\{optPct \/ 100\}\)`/);
  assert.match(leaks, /className="leak-switch-track"/);
  assert.match(leaks, /className="leak-switch-knob"/);
  assert.match(leaks, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*\.leak-progress-fill\s*\{[\s\S]*\.leak-switch-track\s*\{[\s\S]*\.leak-switch-knob\s*\{/);

  // 4-color mini card chips (spans only inside <button>)
  assert.match(leaks, /const MINI_CARD_SUIT_COLORS = \{\s*c:\s*'#4DE0A5',\s*d:\s*'#56D8FF',\s*h:\s*'#FF6B7A',\s*s:\s*'#F1F5FC',?\s*\};/);
  assert.match(leaks, /function renderMiniCardChips\(cards\)/);
  assert.match(leaks, /data-mini-card=\{c\.code\}/);
  assert.match(leaks, /renderMiniCardChips\(snap\.hero_cards\)/);
  assert.match(leaks, /Board: \{renderMiniCardChips\(snap\.board\)\}/);
  assert.match(leaks, /renderMiniCardChips\(linkedHandAudit\.hand\.heroCards\)/);
  assert.match(leaks, /renderMiniCardChips\(linkedHandAudit\.hand\.board\)/);

  // Cleanup: zero pill('muted'), ShareReviewControl checkbox accentColor, decorative icons aria-hidden, dead styles removed
  assert.doesNotMatch(leaks, /pill\('muted'\)/);
  const accentChecks = leaks.match(/accentColor:\s*'#087cfa'/g) || [];
  assert.equal(accentChecks.length, 2, 'ShareReviewControl checkboxes must set accentColor: #087cfa');
  assert.doesNotMatch(leaks, /<(?:X|Inbox|Search|Link2)\s+size=\{\d+\}\s+strokeWidth=\{[\d.]+\}\s*\/>/, 'Every X, Inbox, Search, and Link2 icon in leaks.js must have aria-hidden="true"');
  assert.doesNotMatch(leaks, /\bpageHeader:\s*\{|\bpageTitle:\s*\{|\bpageSub:\s*\{/);
});

test('3. [CoachingWorkspace.module.css & CoachingWorkspace.jsx] Mobile .dangerPanel cascade fix, .searchBar:focus-within, button interactive states, and JSX polish', () => {
  const css = read('src/components/personal-assistant/CoachingWorkspace.module.css');
  const jsx = read('src/components/personal-assistant/CoachingWorkspace.jsx');

  // Mobile .dangerPanel cascade fix
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.panel:not\(\.dangerPanel\)\s*\{/);
  assert.doesNotMatch(css, /@media \(max-width: 600px\)[\s\S]*\.panel\s*\{/);

  // .searchBar:focus-within
  assert.match(css, /\.searchBar:focus-within\s*\{\s*border-color:\s*#56d8ff;\s*outline:\s*2px solid #83deff;\s*outline-offset:\s*1px;\s*\}/);

  // Focus-visible, hover, active (reduced-motion guarded), disabled, and progressTrack span transition
  for (const selector of [
    '\\.goalList button:focus-visible',
    '\\.removeDataButton:focus-visible',
    '\\.claimButton:focus-visible',
    '\\.sheetActionBtn:focus-visible',
    '\\.inlineNotice button:focus-visible',
    '\\.depthControl select:focus-visible',
    '\\.primaryButton:hover:not\\(:disabled\\)',
    '\\.secondaryButton:hover:not\\(:disabled\\)',
    '\\.settingsGearBtn:hover:not\\(:disabled\\)',
    '\\.overflowBtn:hover:not\\(:disabled\\)',
    '\\.priorityList > li > button:hover:not\\(:disabled\\)',
    '\\.leakPicker button:hover:not\\(:disabled\\)',
    '\\.alertAction:hover',
    'transform:\\s*scale\\(0\\.985\\)',
    '\\.progressTrack span\\s*\\{\\s*transition:\\s*transform',
  ]) {
    assert.match(css, new RegExp(selector), `CoachingWorkspace.module.css missing expected rule: ${selector}`);
  }

  // Unused .hairlineSection removed while preserving .viewNav & .activeView and zero #9aabba
  assert.doesNotMatch(css, /\.hairlineSection\b/);
  assert.match(css, /\.viewNav \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(104px, 1fr\)\); \}/);
  assert.match(css, /\.viewNav \.activeView\b/);
  assert.doesNotMatch(css, /#9aabba/i);

  // CoachingWorkspace.jsx polish
  assert.match(jsx, /<strong>\{Math\.round\(bounded\)\}%<\/strong>/);
  assert.match(jsx, /<span style=\{\{ transform: `scaleX\(\$\{bounded \/ 100\}\)` \}\} \/>/);
  assert.match(jsx, /return Number\(rate\.toFixed\(1\)\);/);
  assert.match(jsx, /aria-label="Weekly Coaching Digest"\s+style=\{\{[^}]*accentColor:\s*'#087cfa'/);
  assert.match(jsx, /className="pa-vh"\s+role="status"\s+aria-live="polite"\s+data-testid="copy-coverage-gaps-status"/);
});

test('4. [PersonalAssistantTools.module.css] Filter chip hover + reduced-motion transition and removal of dead .sandboxHero / .sectionRail', () => {
  const css = read('src/styles/worlds/PersonalAssistantTools.module.css');

  assert.match(css, /\.instrumentPanel\s*\{\s*position:\s*relative;\s*overflow:\s*clip;/);
  assert.match(css, /\.filterChip:hover,\s*\.filterMoreBtn:hover\s*\{\s*border-color:\s*rgba\(86, 216, 255, 0\.55\);\s*color:\s*#ffffff;\s*\}/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.filterChip,\s*\.filterMoreBtn\s*\{\s*transition:/);
  assert.doesNotMatch(css, /\.sandboxHero\b/);
  assert.doesNotMatch(css, /\.sectionRail\b/);
});
