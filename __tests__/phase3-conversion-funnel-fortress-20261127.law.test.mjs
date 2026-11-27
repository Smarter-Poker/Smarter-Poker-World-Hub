import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const UNNESTED_MASTHEAD_PAGES = [
  'pages/press.js',
  'pages/authors/index.js',
  'pages/poker-rooms/index.js',
  'pages/games/index.js',
  'pages/rules/index.js',
  'pages/facts.js',
  'pages/poker-series/guides/index.js',
  'pages/freerolls.js',
];

test('PHASE3 LAW 1: Flagship SEO pages never double-nest <SmarterSeoMasthead> inside an outer <header>', () => {
  for (const rel of UNNESTED_MASTHEAD_PAGES) {
    const src = read(rel);
    const mastheadIdx = src.indexOf('<SmarterSeoMasthead');
    assert.ok(mastheadIdx > 0, `${rel} must mount <SmarterSeoMasthead>`);
    const before = src.slice(Math.max(0, mastheadIdx - 450), mastheadIdx);
    assert.doesNotMatch(
      before,
      /<header\b/,
      `${rel} must render <SmarterSeoMasthead> top-level without wrapping it in a duplicate outer <header>`,
    );
  }
});

test('PHASE3 LAW 2: Floating NewsletterCaptureBar defers until scroll >= 320px so above-the-fold masthead CTAs stay unobstructed', () => {
  const wireSrc = read('src/components/news/NewsletterCaptureBar.js');
  assert.match(wireSrc, /window\.scrollY\s*>=\s*320/, 'NewsletterCaptureBar must defer floating render until window.scrollY >= 320');
  assert.match(wireSrc, /!isInline\s*&&\s*!alwaysVisible\s*&&\s*\(quickSignupOpen\s*\|\|\s*!hasScrolled\)/);
});

test('PHASE3 LAW 3: GuestConversionBar includes all UniversalHeader SEO routes in STATIC_HEADER_PREFIXES to prevent 250ms CLS jump', () => {
  const barSrc = read('src/components/seo/GuestConversionBar.jsx');
  for (const route of ['/press', '/sitemap', '/search', '/poker-rooms', '/poker-series', '/rules']) {
    assert.match(
      barSrc,
      new RegExp(`['"]${route}['"]`),
      `GuestConversionBar STATIC_HEADER_PREFIXES must include ${route} to eliminate initial header CLS`,
    );
  }
});

test('PHASE3 LAW 4: SmarterQuickSignupSheet provides 1-tap Google + Facebook OAuth, inline email pre-fill fast-track, trust strip, and PostHog funnel telemetry', () => {
  const sheetSrc = read('src/components/seo/SmarterQuickSignupSheet.jsx');
  assert.match(sheetSrc, /data-testid="quick-signup-google-btn"/);
  assert.match(sheetSrc, /data-testid="quick-signup-facebook-btn"/);
  assert.match(sheetSrc, /data-testid="quick-signup-email-input"/);
  assert.match(sheetSrc, /data-testid="quick-signup-email-submit"/);
  assert.match(sheetSrc, /params\.set\(['"]email['"]/);
  assert.match(sheetSrc, /trackFunnelEvent\(['"]seo_quick_signup_opened['"]/);
  assert.match(sheetSrc, /trackFunnelEvent\(['"]seo_quick_signup_oauth_click['"]/);
  assert.match(sheetSrc, /trackFunnelEvent\(['"]seo_quick_signup_email_continue['"]/);
  assert.match(sheetSrc, /sheetTrustStrip/);
});

test('PHASE3 LAW 5: /auth/signup prefills ?email=, provides mobile 1-tap Facebook CTA, and keeps desktop DOB selects legible without truncating', () => {
  const signupSrc = read('pages/auth/signup.js');
  assert.match(signupSrc, /router\.query\.email/, 'pages/auth/signup.js must prefill email from ?email= query param');
  assert.match(signupSrc, /data-testid="signup-mobile-facebook-cta"/, 'pages/auth/signup.js must provide mobile 1-tap Facebook button');
  assert.match(
    signupSrc,
    /@media\s*\(min-width:\s*769px\)[\s\S]*?select\.auth-input-styled[\s\S]*?font-size:\s*13px/,
    'pages/auth/signup.js must prevent desktop DOB select text truncation while keeping 16px on mobile',
  );
});

test('PHASE3 LAW 6: Peak-intent conversion triggers are wired into all 50+ calculators (CalculatorShareAndPresets) and all 169 starting hand GTO Spot Checks', () => {
  const calcSrc = read('src/components/tools/CalculatorShareAndPresets.js');
  assert.match(calcSrc, /data-testid="calculator-cloud-save-cta"/);
  assert.match(calcSrc, /openQuickSignup\(/);
  assert.match(calcSrc, /sp:seo-tool-engaged/);

  const handSrc = read('pages/learn/hands/[hand].js');
  assert.match(handSrc, /data-testid="hand-spot-check-signup-cta"/);
  assert.match(handSrc, /openQuickSignup\(/);
  assert.match(handSrc, /seo_gto_spot_check_answered/);
});

test('PHASE3 LAW 7: SmarterEngagedConversionPrompt is mounted in _app.js with strict once-per-session anti-annoyance gates and telemetry', () => {
  const appSrc = read('pages/_app.js');
  assert.match(appSrc, /import\s+SmarterEngagedConversionPrompt\s+from/);
  assert.match(appSrc, /<SmarterEngagedConversionPrompt\s*\/>/);

  const promptSrc = read('src/components/seo/SmarterEngagedConversionPrompt.jsx');
  assert.match(promptSrc, /ENGAGED_PROMPT_SHOWN_KEY\s*=\s*['"]sp_engaged_prompt_shown_v1['"]/);
  assert.match(promptSrc, /isGuestBarHiddenRoute/);
  assert.match(promptSrc, /QUICK_SIGNUP_STATE_EVENT/);
  assert.match(promptSrc, /trackFunnelEvent\(['"]seo_engaged_prompt_shown['"]/);
  assert.match(promptSrc, /trackFunnelEvent\(['"]seo_engaged_prompt_clicked['"]/);
});
