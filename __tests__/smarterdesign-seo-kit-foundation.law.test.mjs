import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

test('Wave 1 #SMARTERDESIGN hardware kit & 4-layer conversion primitives exist and enforce sharp corners', () => {
  const css = read('src/components/seo/SmarterSeoKit.module.css');
  assert.ok(css.includes('/images/smarterdesign/chrome-readout.webp'), 'SmarterSeoKit must use chrome-readout.webp');
  assert.ok(css.includes('/images/smarterdesign/chrome-active.webp'), 'SmarterSeoKit must use chrome-active.webp');
  assert.ok(css.includes('/images/smarterdesign/plates/vip-button-primary.png'), 'SmarterSeoKit must use painted primary hardware plate');
  assert.ok(!/border-radius:\s*(8|10|12|14|16|20|999)px/.test(css), 'SmarterSeoKit must not use rounded SaaS card radii');

  const sheet = read('src/components/seo/SmarterQuickSignupSheet.jsx');
  assert.ok(sheet.includes('openQuickSignup'), 'SmarterQuickSignupSheet must export openQuickSignup');
  assert.ok(sheet.includes('beginOAuthAttribution'), 'SmarterQuickSignupSheet must preserve OAuth attribution');
  assert.ok(sheet.includes('quick-signup-google-btn'), 'SmarterQuickSignupSheet must render 1-tap Google CTA');

  const gate = read('src/components/seo/SmarterAccountUnlockGate.jsx');
  assert.ok(gate.includes('data-smarter-unlock-gate'), 'SmarterAccountUnlockGate must expose unlock gate attribute');
  assert.ok(gate.includes('openQuickSignup'), 'SmarterAccountUnlockGate must trigger SmarterQuickSignupSheet');
  assert.ok(gate.includes('solver-matrix') && gate.includes('calculator-pro') && gate.includes('live-venue-intel'), 'SmarterAccountUnlockGate must provide vertical presets');

  const masthead = read('src/components/seo/SmarterSeoMasthead.jsx');
  assert.ok(masthead.includes('/images/smarterdesign/headers/'), 'SmarterSeoMasthead must use approved 3D header scenes & seals');

  const app = read('pages/_app.js');
  assert.ok(app.includes('<SmarterQuickSignupSheet />'), 'pages/_app.js must mount SmarterQuickSignupSheet globally');
});

test('Wave 2 all shared SEO/AEO/GEO components use sharp #SMARTERDESIGN hardware with zero rounded SaaS boxes or banned gold', () => {
  const shared = [
    'src/components/seo/AiPromptLauncher.js',
    'src/components/seo/CitationBacklinkBox.js',
    'src/components/seo/FaqSection.js',
    'src/components/seo/GeoCitationCapsule.js',
    'src/components/seo/GeoFollowUpChain.js',
    'src/components/seo/HubPageSummary.js',
    'src/components/seo/TourPageSummary.js',
    'src/components/seo/SmarterConversionCta.jsx',
    'src/components/seo/GuestConversionBar.jsx',
    'src/components/features/FeatureLanderLayout.js',
    'src/components/news/NewsletterCaptureBar.module.css',
  ];

  for (const rel of shared) {
    const src = read(rel);
    assert.ok(
      !/borderRadius:\s*(8|10|12|14|16|18|20|999)\b/.test(src),
      `${rel} must not use rounded SaaS borderRadius (8..999)`,
    );
    assert.ok(
      !/border-radius:\s*(8|10|12|14|16|18|20|999)px/.test(src),
      `${rel} must not use rounded SaaS border-radius (8..999px)`,
    );
    assert.ok(
      !/#(?:f2b84b|d4a853|ffd700|f59e0b|fbbf24|eab308)/i.test(src),
      `${rel} must not contain banned gold/amber hex colors`,
    );
  }

  const featureLayout = read('src/components/features/FeatureLanderLayout.js');
  assert.ok(featureLayout.includes('SmarterAccountUnlockGate'), 'FeatureLanderLayout must embed SmarterAccountUnlockGate for all 16 /features/* pages');

  const tourSummary = read('src/components/seo/TourPageSummary.js');
  assert.ok(tourSummary.includes('SmarterAccountUnlockGate'), 'TourPageSummary must embed SmarterAccountUnlockGate');

  const signup = read('pages/auth/signup.js');
  assert.ok(signup.includes('signup-unlock-context'), 'pages/auth/signup.js must display unlock context when arriving from an unlock gate');
});
