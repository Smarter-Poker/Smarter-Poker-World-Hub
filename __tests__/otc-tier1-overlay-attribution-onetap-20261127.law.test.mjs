/**
 * OTC TIER 1 CONVERSION PLUMBING, OVERLAY PRIORITY ARBITRATOR, POSTHOG BEACON FIX,
 * FULL ATTRIBUTION PERSISTENCE & GOOGLE ONE TAP (FEDCM) CI FORTRESS (2026-11-27)
 *
 * Permanent root-cause anti-regression laws covering:
 *   1. Overlay Priority Arbitrator (`shouldSuppressNewsletterBar` in NewsletterCaptureBar.js)
 *   2. Production PostHog Beacon Key fallback (`NEXT_PUBLIC_GUIDE_POSTHOG_KEY` in seoFunnelTelemetry.js)
 *   3. Full Attribution & Unlock Intent Persistence (`FIRST_LANDING_KEY`, `UNLOCK_INTENT_KEY`,
 *      `recordUnlockIntent`, `readUnlockIntent`, `firstTouchMetadata`, SmarterQuickSignupSheet,
 *      pages/auth/signup.js, pages/auth/callback.js)
 *   4. Google One Tap FedCM ready component (`SmarterGoogleOneTap.jsx` mounted in `GuestConversionBar.jsx`)
 *   5. #SMARTERDESIGN hygiene: zero em/en dashes, zero lib/analytics bloat on _app.js-reachable
 *      SEO components, and every referenced CSS Module class exists.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  FIRST_TOUCH_KEY,
  FIRST_LANDING_KEY,
  UNLOCK_INTENT_KEY,
  recordFirstTouch,
  recordUnlockIntent,
  readUnlockIntent,
  firstTouchMetadata,
} from '../src/lib/acquisition/firstTouch.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const { create, act } = require('react-test-renderer');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function makeFakeWindow(search = '', pathname = '/', referrer = '') {
  const store = new Map();
  return {
    location: { search, pathname },
    document: { referrer },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    store,
  };
}

function compileCjs(relPath, customRequire, extraGlobals = {}) {
  const source = read(relPath);
  const { outputText } = ts.transpileModule(source, {
    fileName: relPath,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  vm.runInNewContext(outputText, {
    module: mod,
    exports: mod.exports,
    require: customRequire,
    console: { log() {}, warn() {}, error() {} },
    process,
    ...extraGlobals,
  });
  return mod.exports;
}

// ── LAW 1: Overlay Priority Arbitrator ──────────────────────────────────────
test('OTC TIER 1 LAW 1: shouldSuppressNewsletterBar prevents Weekly Wire from colliding with QuickSignupSheet, engaged tools/drills, and mobile conversion routes', () => {
  const captureSrc = read('src/components/news/NewsletterCaptureBar.js');
  assert.match(captureSrc, /sp:quick-signup-state/, 'NewsletterCaptureBar must listen to sp:quick-signup-state');
  assert.match(captureSrc, /sp:seo-tool-engaged/, 'NewsletterCaptureBar must listen to sp:seo-tool-engaged');
  assert.match(captureSrc, /export function shouldSuppressNewsletterBar/, 'NewsletterCaptureBar must export pure shouldSuppressNewsletterBar helper');

  const fnStart = captureSrc.indexOf('export function normalizeCapturePath');
  const fnEnd = captureSrc.indexOf('export default function NewsletterCaptureBar');
  assert.ok(fnStart >= 0 && fnEnd > fnStart, 'Pure helper slice must exist above default export');
  const pureSnippet = captureSrc.slice(fnStart, fnEnd).replace(/^export\s+function\s+/gm, 'function ');
  const sb = { exports: {} };
  vm.runInNewContext(
    `${pureSnippet}\nexports.isNewsletterCaptureRoute = isNewsletterCaptureRoute;\nexports.shouldSuppressNewsletterBar = shouldSuppressNewsletterBar;`,
    sb,
  );
  const { isNewsletterCaptureRoute, shouldSuppressNewsletterBar } = sb.exports;

  // Existing route eligibility contract stays intact
  assert.equal(isNewsletterCaptureRoute('/tools/preflop-ranges'), true);
  assert.equal(isNewsletterCaptureRoute('/learn/hands/ace-king'), true);
  assert.equal(isNewsletterCaptureRoute('/hub/series/5001355'), true);
  assert.equal(isNewsletterCaptureRoute('/hub/news'), true);
  assert.equal(isNewsletterCaptureRoute('/hub/magazine/print/2026-11'), false);

  // 1) QuickSignupSheet open ALWAYS suppresses on every route
  assert.equal(
    shouldSuppressNewsletterBar({ pathname: '/hub/news', quickSignupOpen: true, viewportWidth: 1440, scrollRatio: 0.95 }),
    true,
  );
  assert.equal(
    shouldSuppressNewsletterBar({ pathname: '/tools/preflop-ranges', quickSignupOpen: true, viewportWidth: 1440, scrollRatio: 0.95 }),
    true,
  );

  // 2) Active tool/drill engagement suppresses on all 4 interactive conversion route families
  for (const interactivePath of [
    '/tools/preflop-ranges',
    '/learn/category/preflop',
    '/hub/series/5001355',
    '/features/poker-training-games',
  ]) {
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: interactivePath, toolEngaged: true, viewportWidth: 1440, scrollRatio: 0.95 }),
      true,
      `toolEngaged must suppress NewsletterCaptureBar on ${interactivePath}`,
    );

    // 3) Mobile (< 768px) defers until scrollRatio >= 0.85 or guest bar dismissal
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: interactivePath, viewportWidth: 390, scrollRatio: 0.45 }),
      true,
      `390px mobile at 45% scroll must suppress NewsletterCaptureBar on ${interactivePath}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: interactivePath, viewportWidth: 390, scrollRatio: 0.84 }),
      true,
      `390px mobile at 84% scroll must still suppress NewsletterCaptureBar on ${interactivePath}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: interactivePath, viewportWidth: 390, scrollRatio: 0.85 }),
      false,
      `390px mobile at >=85% scroll allows NewsletterCaptureBar on ${interactivePath}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: interactivePath, viewportWidth: 390, scrollRatio: 0.4, guestBarDismissed: true }),
      false,
      `390px mobile after guest bar dismissal allows NewsletterCaptureBar on ${interactivePath}`,
    );

    // 4) Desktop (>= 768px) without active engagement allows floating bar
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: interactivePath, viewportWidth: 1280, scrollRatio: 0.4 }),
      false,
      `Desktop without tool engagement allows NewsletterCaptureBar on ${interactivePath}`,
    );
  }

  // 5) Non-interactive editorial routes remain unsuppressed on mobile when sheet is closed
  // (Tier 5 promoted /poker-rooms/* into interactive conversion routes for the Local Player Action Strip)
  assert.equal(
    shouldSuppressNewsletterBar({ pathname: '/hub/news', viewportWidth: 390, scrollRatio: 0.35 }),
    false,
  );
  assert.equal(
    shouldSuppressNewsletterBar({ pathname: '/hub/article/wsop-main-event', viewportWidth: 390, scrollRatio: 0.35 }),
    false,
  );
});

// ── LAW 2: Production PostHog Beacon Key Fallback ───────────────────────────
test('OTC TIER 1 LAW 2: seoFunnelTelemetry falls back to NEXT_PUBLIC_GUIDE_POSTHOG_KEY when NEXT_PUBLIC_POSTHOG_KEY is unset', async () => {
  const src = read('src/lib/seo/seoFunnelTelemetry.js');
  assert.match(
    src,
    /process\.env\.NEXT_PUBLIC_POSTHOG_KEY\s*\|\|\s*process\.env\.NEXT_PUBLIC_GUIDE_POSTHOG_KEY/,
    'seoFunnelTelemetry.js must fall back to NEXT_PUBLIC_GUIDE_POSTHOG_KEY',
  );

  const beacons = [];
  const sessionMap = new Map();
  const mockWin = {
    location: { href: 'https://smarter.poker/tools/preflop-ranges', pathname: '/tools/preflop-ranges' },
    navigator: {
      doNotTrack: '0',
      sendBeacon: (url, blob) => {
        beacons.push({ url, blob });
        return true;
      },
    },
    sessionStorage: {
      getItem: (k) => (sessionMap.has(k) ? sessionMap.get(k) : null),
      setItem: (k, v) => { sessionMap.set(k, String(v)); },
    },
  };

  const savedPrimary = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const savedGuide = process.env.NEXT_PUBLIC_GUIDE_POSTHOG_KEY;
  try {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    process.env.NEXT_PUBLIC_GUIDE_POSTHOG_KEY = 'phc_live_guide_key_test';

    const mod = compileCjs(
      'src/lib/seo/seoFunnelTelemetry.js',
      () => ({}),
      { window: mockWin, document: { referrer: 'https://www.google.com/' }, Blob },
    );

    mod.trackSeoFunnelEvent('seo_quick_signup_opened', { unlock_key: 'solver-matrix' });
    assert.equal(beacons.length, 1, 'sendBeacon must fire using NEXT_PUBLIC_GUIDE_POSTHOG_KEY');
    assert.equal(beacons[0].url, 'https://us.i.posthog.com/capture/');
    const payload = JSON.parse(await beacons[0].blob.text());
    assert.equal(payload.api_key, 'phc_live_guide_key_test');
    assert.equal(payload.event, 'seo_quick_signup_opened');
    assert.equal(payload.properties.unlock_key, 'solver-matrix');
    assert.equal(payload.properties.$pathname, '/tools/preflop-ranges');

    // When both keys are unset, silently no-ops
    delete process.env.NEXT_PUBLIC_GUIDE_POSTHOG_KEY;
    mod.trackSeoFunnelEvent('seo_should_skip', {});
    assert.equal(beacons.length, 1, 'No beacon should fire when both PostHog keys are unset');
  } finally {
    if (savedPrimary === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = savedPrimary;
    if (savedGuide === undefined) delete process.env.NEXT_PUBLIC_GUIDE_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_GUIDE_POSTHOG_KEY = savedGuide;
  }
});

// ── LAW 3: Full Attribution & Unlock Persistence ────────────────────────────
test('OTC TIER 1 LAW 3: firstTouch persists dark-social landing paths and 1-hour unlock intent into metadata, signup.js, callback.js, and QuickSignupSheet', () => {
  assert.equal(FIRST_LANDING_KEY, 'sp_first_landing_v1');
  assert.equal(UNLOCK_INTENT_KEY, 'sp_unlock_intent_v1');

  const t0 = Date.parse('2026-11-27T18:00:00Z');

  // 1) Dark-social / iOS Safari landing (empty search, empty referrer) records FIRST_LANDING_KEY without altering FIRST_TOUCH_KEY return value
  const darkWin = makeFakeWindow('', '/tools/poker-odds-calculator', '');
  assert.equal(recordFirstTouch(darkWin, t0), null, 'recordFirstTouch return value stays null when UTM and referrer are empty');
  assert.equal(darkWin.store.has(FIRST_TOUCH_KEY), false, 'FIRST_TOUCH_KEY stays unset for dark-social visits');
  assert.equal(darkWin.store.has(FIRST_LANDING_KEY), true, 'FIRST_LANDING_KEY must capture dark-social public landing path');

  // Navigating to another SEO page must NOT overwrite the first landing path
  darkWin.location = { search: '', pathname: '/learn/hands/ace-king' };
  recordFirstTouch(darkWin, t0 + 10_000);
  assert.deepEqual(firstTouchMetadata(darkWin, t0 + 20_000), {
    acquisition_landing_path: '/tools/poker-odds-calculator',
  });

  // 2) recordUnlockIntent + readUnlockIntent sanitize tags and enforce 1-hour TTL
  const saved = recordUnlockIntent(
    {
      unlockKey: 'Solver-Matrix',
      source: 'quick-signup-sheet',
      experimentVariant: 'welcome-vip-500',
      aiEngine: 'chatgpt',
    },
    darkWin,
    t0 + 30_000,
  );
  assert.equal(saved.unlock_key, 'solver-matrix');
  assert.equal(saved.seo_source, 'quick-signup-sheet');
  assert.equal(saved.experiment_variant, 'welcome-vip-500');
  assert.equal(saved.acquisition_ai_engine, 'chatgpt');

  // Within 1 hour: readUnlockIntent and firstTouchMetadata both surface all attribution fields
  assert.deepEqual(readUnlockIntent(darkWin, t0 + 30_000 + 59 * 60_000), {
    unlock_key: 'solver-matrix',
    seo_source: 'quick-signup-sheet',
    experiment_variant: 'welcome-vip-500',
    acquisition_ai_engine: 'chatgpt',
  });
  assert.deepEqual(firstTouchMetadata(darkWin, t0 + 60_000), {
    acquisition_landing_path: '/tools/poker-odds-calculator',
    unlock_key: 'solver-matrix',
    seo_source: 'quick-signup-sheet',
    experiment_variant: 'welcome-vip-500',
    acquisition_ai_engine: 'chatgpt',
  });

  // After 1 hour: unlock intent expires cleanly while landing path remains
  assert.equal(readUnlockIntent(darkWin, t0 + 30_000 + 61 * 60_000), null);
  assert.deepEqual(firstTouchMetadata(darkWin, t0 + 30_000 + 61 * 60_000), {
    acquisition_landing_path: '/tools/poker-odds-calculator',
  });

  // Malicious tags are rejected by cleanTag sanitization
  const xssWin = makeFakeWindow('', '/', '');
  assert.equal(
    recordUnlockIntent({ unlockKey: '<script>alert(1)</script>', source: 'bad source!' }, xssWin, t0),
    null,
  );
  assert.deepEqual(firstTouchMetadata(xssWin, t0), {});

  // 3) SmarterQuickSignupSheet wires recordUnlockIntent across open, OAuth click, and email submit
  const sheetSrc = read('src/components/seo/SmarterQuickSignupSheet.jsx');
  const unlockIntentCalls = sheetSrc.match(/recordUnlockIntent\s*\(/g) || [];
  assert.ok(unlockIntentCalls.length >= 3, `SmarterQuickSignupSheet must call recordUnlockIntent on open, OAuth, and email submit (found ${unlockIntentCalls.length})`);

  // 4) pages/auth/signup.js merges ?unlock= and ?src= plus firstTouchMetadata() into signUp options.data
  const signupSrc = read('pages/auth/signup.js');
  assert.match(signupSrc, /\.\.\.firstTouchMetadata\(\)/);
  assert.match(signupSrc, /unlock_key:\s*queryUnlockKey/);
  assert.match(signupSrc, /seo_source:\s*querySeoSource/);

  // 5) pages/auth/callback.js persists all 5 attribution fields for brand-new OAuth accounts
  const callbackSrc = read('pages/auth/callback.js');
  assert.match(callbackSrc, /firstTouchMetadata/);
  for (const field of [
    'unlock_key',
    'seo_source',
    'experiment_variant',
    'acquisition_ai_engine',
    'acquisition_landing_path',
  ]) {
    assert.match(callbackSrc, new RegExp(`\\b${field}\\b`), `pages/auth/callback.js must persist ${field} for new OAuth signups`);
  }
});

// ── LAW 4: Google One Tap (FedCM) Ready Component & GuestConversionBar Mount ─
test('OTC TIER 1 LAW 4: SmarterGoogleOneTap silently no-ops without client ID, lazy-loads FedCM after 2500ms for guests, calls signInWithIdToken, and redirects cleanly', async () => {
  const oneTapSrc = read('src/components/seo/SmarterGoogleOneTap.jsx');
  const guestBarSrc = read('src/components/seo/GuestConversionBar.jsx');

  assert.match(oneTapSrc, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(oneTapSrc, /NEXT_PUBLIC_GOOGLE_CLIENT_ID/);
  assert.match(oneTapSrc, /use_fedcm_for_prompt:\s*true/);
  assert.match(oneTapSrc, /auto_select:\s*false/);
  assert.match(oneTapSrc, /cancel_on_tap_outside:\s*true/);
  assert.match(oneTapSrc, /signInWithIdToken/);
  assert.match(oneTapSrc, /seo_google_one_tap_success/);
  assert.match(guestBarSrc, /dynamic\(\(\) => import\('\.\/SmarterGoogleOneTap'\)/);
  assert.doesNotMatch(guestBarSrc, /import SmarterGoogleOneTap from '\.\/SmarterGoogleOneTap'/);
  assert.match(guestBarSrc, /<SmarterGoogleOneTap\b/);

  const savedClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  try {
    // Case A: Graceful silent no-op when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    let timerCount = 0;
    let appendedScripts = [];
    const mockWinNoop = {
      location: { pathname: '/tools/preflop-ranges', replace() {} },
      localStorage: { length: 0, getItem: () => null, key: () => null },
      sessionStorage: { getItem: () => null, setItem() {} },
      setTimeout: (fn, ms) => { timerCount += 1; return 1; },
      clearTimeout() {},
    };
    const mockDocNoop = {
      querySelector: () => null,
      createElement: () => ({ setAttribute() {}, addEventListener() {} }),
      head: { appendChild: (el) => appendedScripts.push(el) },
    };

    const loadOneTap = (win, doc, mocks = {}) =>
      compileCjs(
        'src/components/seo/SmarterGoogleOneTap.jsx',
        (name) => {
          if (name === 'react' || name === 'react/jsx-runtime') return require(name);
          if (name.endsWith('/supabase')) return { supabase: mocks.supabase || { auth: {} } };
          if (name.endsWith('/seoFunnelTelemetry')) return { trackSeoFunnelEvent: mocks.track || (() => {}) };
          if (name.endsWith('/seoExperiment')) {
            return {
              getSeoOfferExperiment: () => 'welcome-vip-500',
              getAiWelcomeContext: () => ({ engine: 'chatgpt', label: 'ChatGPT' }),
            };
          }
          if (name.endsWith('/firstTouch.mjs')) {
            return {
              recordFirstTouch: mocks.recordFirstTouch || (() => null),
              recordUnlockIntent: mocks.recordUnlockIntent || (() => null),
              firstTouchMetadata: () => ({ acquisition_landing_path: '/tools/preflop-ranges' }),
            };
          }
          if (name.endsWith('/SmarterUnlockedWelcomeBanner')) {
            return {
              recordPendingSeoUnlock: mocks.recordPendingSeoUnlock || (() => {}),
              promotePendingSeoUnlock: mocks.promotePendingSeoUnlock || (() => {}),
            };
          }
          throw new Error(`Unexpected SmarterGoogleOneTap import: ${name}`);
        },
        { window: win, document: doc, fetch: mocks.fetch },
      );

    const noopMod = loadOneTap(mockWinNoop, mockDocNoop);
    let tree;
    await act(async () => {
      tree = create(React.createElement(noopMod.default, { currentPath: '/tools/preflop-ranges', signedIn: false }));
    });
    assert.equal(tree.toJSON(), null);
    assert.equal(timerCount, 0, 'Must not schedule timer when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset');
    assert.equal(appendedScripts.length, 0, 'Must not inject GSI script when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset');
    await act(async () => { tree.unmount(); });

    // Case B: Active FedCM initialization after 2500ms delay + credential callback flow
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = '123456789-test.apps.googleusercontent.com';
    const scheduled = [];
    const scripts = [];
    const tracked = [];
    const calls = {
      recordFirstTouch: 0,
      recordUnlockIntent: [],
      recordPendingSeoUnlock: [],
      promotePendingSeoUnlock: [],
      signInWithIdToken: [],
      updateUser: [],
      redirects: [],
    };
    let gsiConfig = null;
    let prompted = false;
    let cancelledGsi = false;

    const sessionStore = new Map();
    const mockWinActive = {
      location: {
        pathname: '/tools/preflop-ranges',
        replace: (url) => calls.redirects.push(url),
      },
      localStorage: { length: 0, getItem: () => null, key: () => null },
      sessionStorage: {
        getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
        setItem: (k, v) => { sessionStore.set(k, String(v)); },
      },
      setTimeout: (fn, ms) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      },
      clearTimeout() {},
    };

    const mockDocActive = {
      querySelector: () => null,
      createElement: () => {
        const listeners = {};
        return {
          src: '',
          async: false,
          defer: false,
          attrs: {},
          setAttribute(k, v) { this.attrs[k] = v; },
          addEventListener(ev, fn) { listeners[ev] = fn; },
          _trigger(ev) { if (listeners[ev]) listeners[ev](); },
        };
      },
      head: { appendChild: (el) => scripts.push(el) },
    };

    const activeMod = loadOneTap(mockWinActive, mockDocActive, {
      track: (event, props) => tracked.push({ event, props }),
      recordFirstTouch: () => { calls.recordFirstTouch += 1; },
      recordUnlockIntent: (arg) => calls.recordUnlockIntent.push(arg),
      recordPendingSeoUnlock: (arg) => calls.recordPendingSeoUnlock.push(arg),
      promotePendingSeoUnlock: (arg) => calls.promotePendingSeoUnlock.push(arg),
      fetch: async () => ({
        ok: true,
        json: async () => ({ welcomePackage: { withheldReason: 'phone_not_verified' } }),
      }),
      supabase: {
        auth: {
          signInWithIdToken: async (payload) => {
            calls.signInWithIdToken.push(payload);
            return {
              data: {
                session: { access_token: 'tok_onetap_123', user: { id: 'u-1', email: 'player@example.com', user_metadata: {} } },
                user: { id: 'u-1', email: 'player@example.com', user_metadata: {} },
              },
              error: null,
            };
          },
          updateUser: async (arg) => {
            calls.updateUser.push(arg);
            return { data: {}, error: null };
          },
        },
      },
    });

    await act(async () => {
      tree = create(React.createElement(activeMod.default, { currentPath: '/tools/preflop-ranges', signedIn: false }));
    });
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].ms, 2500, 'Google One Tap must defer loading by 2500ms so LCP stays unblocked');
    assert.equal(scripts.length, 0, 'GSI script must not inject before 2500ms idle delay');

    // Fire 2500ms timer -> script injected -> load event fires -> GSI initialized with FedCM
    await act(async () => {
      scheduled[0].fn();
    });
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, 'https://accounts.google.com/gsi/client');
    assert.equal(scripts[0].async, true);
    assert.equal(scripts[0].defer, true);

    mockWinActive.google = {
      accounts: {
        id: {
          initialize: (cfg) => { gsiConfig = cfg; },
          prompt: () => { prompted = true; },
          cancel: () => { cancelledGsi = true; },
        },
      },
    };
    await act(async () => {
      scripts[0]._trigger('load');
    });

    assert.ok(gsiConfig, 'GSI initialize must be called on script load');
    assert.equal(gsiConfig.client_id, '123456789-test.apps.googleusercontent.com');
    assert.equal(gsiConfig.use_fedcm_for_prompt, true);
    assert.equal(gsiConfig.auto_select, false);
    assert.equal(gsiConfig.cancel_on_tap_outside, true);
    assert.equal(prompted, true);

    // Invoke Google credential callback
    await act(async () => {
      await gsiConfig.callback({ credential: 'mock-google-id-token-jwt' });
    });

    assert.equal(calls.recordFirstTouch, 1);
    assert.equal(calls.recordUnlockIntent.length, 1);
    assert.equal(calls.recordPendingSeoUnlock.length, 1);
    assert.equal(calls.promotePendingSeoUnlock.length, 1);
    assert.equal(calls.signInWithIdToken.length, 1);
    assert.deepEqual(
      { ...calls.signInWithIdToken[0] },
      { provider: 'google', token: 'mock-google-id-token-jwt' },
    );
    assert.ok(tracked.some((t) => t.event === 'seo_google_one_tap_success'));
    assert.deepEqual(calls.redirects, ['/hub/verify-phone?welcome=1&next=%2Ftools%2Fpreflop-ranges%3Funlocked%3D1']);

    await act(async () => { tree.unmount(); });
    assert.equal(cancelledGsi, true, 'Unmounting SmarterGoogleOneTap must cancel pending GSI prompt');
  } finally {
    if (savedClientId === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = savedClientId;
  }
});

// ── LAW 5: Hygiene (Zero Em Dashes, Zero analytics.js Bloat, Valid CSS Classes) ─
test('OTC TIER 1 LAW 5: All modified/new conversion files have zero em/en dashes, zero lib/analytics bloat, and valid CSS module references', () => {
  const checkedSeoFiles = [
    'src/components/seo/SmarterGoogleOneTap.jsx',
    'src/components/seo/GuestConversionBar.jsx',
    'src/components/seo/SmarterQuickSignupSheet.jsx',
    'src/lib/seo/seoFunnelTelemetry.js',
    'src/components/news/NewsletterCaptureBar.js',
  ];

  for (const rel of checkedSeoFiles) {
    const src = read(rel);
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(codeOnly, /[\u2014\u2013]/, `${rel} must contain zero em or en dashes`);
    assert.doesNotMatch(codeOnly, /lib\/analytics/, `${rel} must not statically import lib/analytics`);
  }

  // Verify every styles.* class referenced in NewsletterCaptureBar.js exists in NewsletterCaptureBar.module.css
  const barSrc = read('src/components/news/NewsletterCaptureBar.js');
  const barCss = read('src/components/news/NewsletterCaptureBar.module.css');
  const definedBarClasses = new Set([...barCss.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]));
  for (const m of barSrc.matchAll(/\bstyles\.([A-Za-z][A-Za-z0-9_-]*)\b/g)) {
    assert.ok(definedBarClasses.has(m[1]), `Undefined NewsletterCaptureBar CSS class: styles.${m[1]}`);
  }
});
