/**
 * Organic-To-Customer Tier 9 Fortress Law Suite (2026-11-28)
 * ==========================================================
 * Locks:
 * 1. Read-only boolean-only Auth Door Readiness probe (zero secrets/PII)
 *    wired into pages/api/health/signup.js.
 * 2. Live production read-only sitemap, dynamic OG PNG, rich-snippet JSON-LD,
 *    and Google/Facebook OAuth redirect smoke probe script.
 * 3. Cross-surface Tier 8->9 route & key parity:
 *    - /hub/tournaments/this-weekend suppressed by NewsletterCaptureBar AND
 *      supported by /hub/verify-phone (?unlocked=1 + destination description).
 *    - returning-guest-sync covered in BOTH UNLOCK_COPY_MAP and PWAInstallPrompt.
 * 4. Strict hygiene (zero em/en dashes, zero banned gold, zero secret leaks).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateAuthDoors } from '../src/lib/acquisition/authDoorProbe.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('OTC TIER 9 LAW 1: evaluateAuthDoors returns boolean-only readiness with zero secret leakage and is wired into /api/health/signup', () => {
  const secretClientId = '1234567890-supersecretclientid.apps.googleusercontent.com';
  const secretAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fakeanonkeypayload123456';

  const ready = evaluateAuthDoors({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: secretAnonKey,
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: secretClientId,
    },
    attribution: {
      totalSignups: 40,
      providers: { oauth_total: 15 },
    },
  });

  assert.equal(ready.supabaseAuthConfigured, true);
  assert.equal(ready.googleOneTapConfigured, true);
  assert.equal(ready.googleOAuthDoorWired, true);
  assert.equal(ready.facebookOAuthDoorWired, true);
  assert.equal(ready.magicLinkDoorWired, true);
  assert.equal(ready.callbackPath, '/auth/callback');
  assert.equal(ready.oauthSharePct, 37.5);

  const serialized = JSON.stringify(ready);
  assert.ok(!serialized.includes(secretClientId), 'Must never leak Google client ID');
  assert.ok(!serialized.includes(secretAnonKey), 'Must never leak Supabase anon key');

  const unconfigured = evaluateAuthDoors({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'short',
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'placeholder-client-id',
    },
    attribution: { totalSignups: 0, providers: { oauth_total: 0 } },
  });
  assert.equal(unconfigured.supabaseAuthConfigured, false);
  assert.equal(unconfigured.googleOneTapConfigured, false);
  assert.equal(unconfigured.oauthSharePct, null);

  const signupHealthSrc = read('pages/api/health/signup.js');
  assert.match(signupHealthSrc, /import\s*\{\s*evaluateAuthDoors\s*\}\s*from\s*['"][^'"]*authDoorProbe\.mjs['"]/);
  assert.match(signupHealthSrc, /evaluateAuthDoors\(\s*\{\s*env:\s*process\.env,\s*attribution:\s*attributionRes\s*\}\s*\)/);
});

test('OTC TIER 9 LAW 2: live production sitemap/OG/schema/OAuth smoke script covers all 5 sitemaps, 4 PNG OG cards, 10 sampled pages, and both OAuth providers', () => {
  const probePath = 'scripts/seo/verify-live-conversion-and-sitemaps.mjs';
  assert.ok(fs.existsSync(path.join(REPO, probePath)), `${probePath} must exist`);
  const src = read(probePath);

  for (const sm of ['/sitemap.xml', '/sitemap-tools.xml', '/sitemap-compare.xml', '/sitemap-venues.xml', '/sitemap-videos.xml']) {
    assert.ok(src.includes(`'${sm}'`), `Missing sitemap check for ${sm}`);
  }
  for (const og of [
    '/api/og/tool-card?tool=leak-finder',
    '/api/og/tool-card?tool=gto-drill',
    '/api/og/tool-card?tool=odds',
    '/api/og/series-card?name=',
  ]) {
    assert.ok(src.includes(og), `Missing dynamic OG PNG probe for ${og}`);
  }
  for (const page of [
    '/tools/gto-leak-finder',
    '/tools/bankroll-calculator',
    '/tools/preflop-ranges/btn',
    '/tools/embeds',
    '/hub/tournaments/this-weekend',
    '/compare/smarter-poker-vs-pokercode',
    '/tools/odds/ak-vs-qq-short-deck',
    '/glossary/pot-odds',
    '/rules/texas-holdem',
    '/poker-rooms/states/texas',
  ]) {
    assert.ok(src.includes(`'${page}'`), `Missing sampled page probe for ${page}`);
  }
  assert.match(src, /\['google',\s*'facebook'\]/, 'Must probe both Google and Facebook OAuth authorize redirects');
  assert.match(src, /accounts\.google\.com/, 'Must validate Google OAuth redirect target');
  assert.match(src, /facebook\.com/, 'Must validate Facebook OAuth redirect target');
  assert.match(src, /redirect:\s*'manual'/, 'Must inspect 302 Location without following external OAuth redirects');
});

test('OTC TIER 9 LAW 3: /hub/tournaments/this-weekend and returning-guest-sync have full cross-surface parity across NewsletterCaptureBar, verify-phone, WelcomeBanner, and PWAInstallPrompt', () => {
  const newsletterSrc = read('src/components/news/NewsletterCaptureBar.js');
  assert.ok(
    newsletterSrc.includes("'/hub/tournaments/'"),
    'NewsletterCaptureBar INTERACTIVE_CONVERSION_PREFIXES must include /hub/tournaments/',
  );

  const verifyPhoneSrc = read('pages/hub/verify-phone.js');
  assert.ok(
    verifyPhoneSrc.includes("'/hub/tournaments/'"),
    'pages/hub/verify-phone.js SEO_UNLOCK_PREFIXES must include /hub/tournaments/',
  );
  assert.match(
    verifyPhoneSrc,
    /pathname\.startsWith\(['"]\/hub\/tournaments\/['"]\)/,
    'describePendingDestination must describe /hub/tournaments/ destinations',
  );
  assert.ok(
    verifyPhoneSrc.includes('Your Upcoming Tournament Reminders'),
    'describePendingDestination must return clean Title Case tournament reminder copy',
  );

  const welcomeSrc = read('src/components/seo/SmarterUnlockedWelcomeBanner.jsx');
  assert.ok(
    welcomeSrc.includes("'returning-guest-sync'"),
    'SmarterUnlockedWelcomeBanner UNLOCK_COPY_MAP must include returning-guest-sync',
  );

  const pwaSrc = read('src/components/ui/PWAInstallPrompt.jsx');
  assert.ok(
    pwaSrc.includes("'returning-guest-sync'"),
    'PWAInstallPrompt PEAK_UTILITY_GTO_KEYS must include returning-guest-sync',
  );
});

test('OTC TIER 9 LAW 4: Tier 9 files obey strict hygiene (zero em/en dashes, zero banned gold hexes, zero hardcoded secrets)', () => {
  const owned = [
    'src/lib/acquisition/authDoorProbe.mjs',
    'scripts/seo/verify-live-conversion-and-sitemaps.mjs',
  ];
  const bannedGold = /#(D4AF37|FFD700|F59E0B|EAB308|D97706|B45309|92400E|FBBF24)/i;
  for (const rel of owned) {
    const src = read(rel);
    assert.ok(!/[\u2013\u2014]/.test(src), `${rel} must contain zero em/en dashes`);
    assert.ok(!bannedGold.test(src), `${rel} must contain zero banned gold hexes`);
    assert.ok(!/service_role|eyJhbGci/i.test(src), `${rel} must contain zero hardcoded tokens or keys`);
  }
});
