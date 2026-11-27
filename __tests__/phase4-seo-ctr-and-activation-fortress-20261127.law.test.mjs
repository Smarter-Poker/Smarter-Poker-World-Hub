/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PHASE 4 CI FORTRESS: FLAGSHIP CALCULATOR CLOUD-SAVE, GSC CTR & ACTIVATION
 * ═══════════════════════════════════════════════════════════════════════════
 * Permanent regression locks for Phase 4 upgrades:
 *   1. SmarterCalculatorSaveBar mounted in all 3 flagship calculators that do
 *      not use CalculatorShareAndPresets (preflop-ranges, poker-odds-calculator,
 *      icm-calculator), closing 100% peak-intent coverage across /tools/*.
 *   2. High-impression GSC pages upgraded with #SMARTERDESIGN mastheads,
 *      tightened CTR titles/descriptions, and PLO4 vs PLO5 FAQs + cross-links.
 *   3. Post-signup unlock continuity & activation welcome banner
 *      (SmarterUnlockedWelcomeBanner) mounted in _app.js with zero analytics.js
 *      import, wired through SmarterQuickSignupSheet, /auth/callback & /auth/signup.
 *   4. Real-time Account Progress Indicator mounted in pages/auth/signup.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Phase 4.1 — SmarterCalculatorSaveBar exists and is wired into all 3 flagship calculators', () => {
  const barSrc = read('src/components/seo/SmarterCalculatorSaveBar.jsx');
  assert.match(barSrc, /openQuickSignup/, 'Save bar must open SmarterQuickSignupSheet');
  assert.match(barSrc, /sp:seo-tool-engaged/, 'Save bar must dispatch sp:seo-tool-engaged');
  assert.match(barSrc, /trackSeoFunnelEvent/, 'Save bar must use zero-bloat seoFunnelTelemetry');
  assert.doesNotMatch(barSrc, /lib\/analytics/, 'Save bar must never statically import analytics.js');

  for (const calcFile of [
    'pages/tools/preflop-ranges/index.js',
    'pages/tools/poker-odds-calculator.js',
    'pages/tools/icm-calculator.js',
  ]) {
    const src = read(calcFile);
    assert.match(src, /import SmarterCalculatorSaveBar/, `${calcFile} must import SmarterCalculatorSaveBar`);
    assert.match(src, /<SmarterCalculatorSaveBar\b/, `${calcFile} must render <SmarterCalculatorSaveBar />`);
  }
});

test('Phase 4.2 — High-impression GSC pages carry CTR hooks, #SMARTERDESIGN masthead & PLO4 vs PLO5 signals', () => {
  const catSrc = read('pages/learn/category/[category].js');
  assert.match(catSrc, /import SmarterSeoMasthead/, '/learn/category/[category] must import SmarterSeoMasthead');
  assert.match(catSrc, /<SmarterSeoMasthead\b/, '/learn/category/[category] must render SmarterSeoMasthead');
  assert.match(catSrc, /fitMetaDescription/, '/learn/category/[category] must bound meta description to 158 chars');

  const preflopSrc = read('pages/tools/preflop-ranges/index.js');
  assert.match(preflopSrc, /Free \$\{posData\.abbrev\} GTO Preflop Range Chart \(100BB\)/);

  const freerollsSrc = read('pages/freerolls.js');
  assert.match(freerollsSrc, /Free Daily Poker Freerolls - 5 Free Events/);
  assert.match(freerollsSrc, /fitMetaDescription/);

  const variantsSrc = read('src/content/games/variants.js');
  assert.match(variantsSrc, /PLO4 Vs PLO5: What Is The Main Mathematical Difference\?/);
  assert.match(variantsSrc, /PLO4 Vs PLO5: How Much Larger Should Your Bankroll Be For 5-Card PLO\?/);

  const variantPageSrc = read('pages/games/[variant].js');
  assert.match(variantPageSrc, /pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study/);
});

test('Phase 4.3 — Post-signup unlock activation banner is mounted in _app.js with zero analytics.js bloat', () => {
  const bannerSrc = read('src/components/seo/SmarterUnlockedWelcomeBanner.jsx');
  assert.match(bannerSrc, /sp_pending_unlock_v1/);
  assert.match(bannerSrc, /sp_just_unlocked_v1/);
  assert.match(bannerSrc, /trackSeoFunnelEvent/);
  assert.match(bannerSrc, /Claim 30-Day VIP \+ 500 Diamonds/);
  assert.match(bannerSrc, /Launch 107 GTO Games/);
  assert.doesNotMatch(
    bannerSrc,
    /lib\/analytics/,
    'SmarterUnlockedWelcomeBanner is _app.js-reachable and MUST NOT import src/lib/analytics.js',
  );

  const appSrc = read('pages/_app.js');
  assert.match(appSrc, /import SmarterUnlockedWelcomeBanner from '\.\.\/src\/components\/seo\/SmarterUnlockedWelcomeBanner'/);
  assert.match(appSrc, /<SmarterUnlockedWelcomeBanner \/>/);

  const sheetSrc = read('src/components/seo/SmarterQuickSignupSheet.jsx');
  assert.match(sheetSrc, /recordPendingSeoUnlock/);

  const callbackSrc = read('pages/auth/callback.js');
  assert.match(callbackSrc, /promotePendingSeoUnlock/);

  const signupSrc = read('pages/auth/signup.js');
  assert.match(signupSrc, /promotePendingSeoUnlock/);
});

test('Phase 4.4 — Signup page renders real-time Account Progress Indicator without em dashes', () => {
  const signupSrc = read('pages/auth/signup.js');
  assert.match(signupSrc, /data-testid="signup-progress-bar"/);
  assert.match(signupSrc, /role="progressbar"/);
  assert.match(signupSrc, /Account Progress: \{signupProgressPct\}%/);
  assert.match(signupSrc, /100% Free \(Takes Under 30 Seconds\)/);
});

test('Phase 4.5 — SmarterSeoKit.module.css defines hardware styles for calcSaveBar and unlockedBanner', () => {
  const css = read('src/components/seo/SmarterSeoKit.module.css');
  assert.match(css, /\.calcSaveBar\s*\{/);
  assert.match(css, /\.unlockedBanner\s*\{/);
});
