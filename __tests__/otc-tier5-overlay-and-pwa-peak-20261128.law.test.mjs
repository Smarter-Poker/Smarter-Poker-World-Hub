/**
 * OTC TIER 5 COMPLETE MOBILE OVERLAY ARBITRATION & PEAK-UTILITY PWA INSTALL
 * ACTIVATION CI FORTRESS (2026-11-28)
 *
 * Permanent root-cause anti-regression laws covering:
 *   1. Expanded Mobile Overlay Priority Arbitrator (`isInteractiveConversionRoute`
 *      and `shouldSuppressNewsletterBar` in `src/components/news/NewsletterCaptureBar.js`)
 *      protecting Local Player Action Strip, Glossary/Rules Tool Bridges, Compare
 *      Switchers, Freerolls, Tours, and Venue Unlock Gates on <768px mobile viewports
 *      below 85% scroll while preserving immediate Weekly Wire capture on pure editorial
 *      routes (`/hub/news`, `/hub/article`, `/hub/wire`, `/hub/magazine`) and keeping
 *      `isNewsletterCaptureRoute()` intact.
 *   2. Peak-Utility PWA Install Activation (`resolvePeakUtilityPwaCopy` and
 *      `sp:peak-utility-pwa` listener lifecycle in `src/components/ui/PWAInstallPrompt.jsx`)
 *      with zero static `lib/analytics` imports and full auth-route, installed, snooze,
 *      and account-age contract preservation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { installPromptDelay } from '../src/lib/signupExperience.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const { create, act } = require('react-test-renderer');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function loadNewsletterPureHelpers() {
  const src = read('src/components/news/NewsletterCaptureBar.js');
  const fnStart = src.indexOf('export function normalizeCapturePath');
  const fnEnd = src.indexOf('export default function NewsletterCaptureBar');
  assert.ok(fnStart >= 0 && fnEnd > fnStart, 'Pure helper slice must exist above default export');
  const pureSnippet = src.slice(fnStart, fnEnd).replace(/^export\s+function\s+/gm, 'function ');
  const sb = { exports: {} };
  vm.runInNewContext(
    `${pureSnippet}
exports.isNewsletterCaptureRoute = isNewsletterCaptureRoute;
exports.isInteractiveConversionRoute = isInteractiveConversionRoute;
exports.shouldSuppressNewsletterBar = shouldSuppressNewsletterBar;`,
    sb,
  );
  return sb.exports;
}

// ── LAW 1: Expanded Mobile Overlay Priority Arbitrator ──────────────────────
test('OTC TIER 5 LAW 1: isInteractiveConversionRoute and shouldSuppressNewsletterBar protect all interactive SEO/local/compare/glossary/rules routes on mobile while preserving editorial routes', () => {
  const {
    isNewsletterCaptureRoute,
    isInteractiveConversionRoute,
    shouldSuppressNewsletterBar,
  } = loadNewsletterPureHelpers();

  const tier5InteractiveRoutes = [
    '/poker-rooms',
    '/poker-rooms/',
    '/poker-rooms/states/texas',
    '/poker-rooms/guides/las-vegas',
    '/hub/venues/bellagio',
    '/hub/poker-near-me',
    '/hub/poker-near-me/map',
    '/hub/tours/wsop',
    '/compare',
    '/compare/',
    '/compare/smarter-poker-vs-gto-wizard',
    '/freerolls',
    '/glossary',
    '/glossary/pot-odds',
    '/rules',
    '/rules/texas-holdem',
  ];

  for (const route of tier5InteractiveRoutes) {
    assert.equal(
      isInteractiveConversionRoute(route),
      true,
      `isInteractiveConversionRoute must cover ${route}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: route, viewportWidth: 390, scrollRatio: 0.45 }),
      true,
      `390px mobile at 45% scroll must suppress Weekly Wire bar on ${route}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: route, viewportWidth: 390, scrollRatio: 0.84 }),
      true,
      `390px mobile at 84% scroll must suppress Weekly Wire bar on ${route}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: route, viewportWidth: 390, scrollRatio: 0.85 }),
      false,
      `390px mobile at >=85% scroll must allow Weekly Wire bar on ${route}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({
        pathname: route,
        viewportWidth: 390,
        scrollRatio: 0.4,
        guestBarDismissed: true,
      }),
      false,
      `390px mobile after guest bar dismissal must allow Weekly Wire bar on ${route}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: route, viewportWidth: 1280, scrollRatio: 0.4 }),
      false,
      `Desktop without tool engagement must allow Weekly Wire bar on ${route}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({
        pathname: route,
        viewportWidth: 1280,
        scrollRatio: 0.9,
        toolEngaged: true,
      }),
      true,
      `Active tool engagement must suppress Weekly Wire bar on ${route}`,
    );
  }

  // Existing Tier 1 interactive families remain covered
  for (const existingRoute of [
    '/tools/preflop-ranges',
    '/learn/hands/ace-king',
    '/hub/series/5001355',
    '/features/poker-training-games',
  ]) {
    assert.equal(isInteractiveConversionRoute(existingRoute), true);
  }

  // Pure editorial routes remain immediately eligible on mobile
  for (const editorialRoute of [
    '/hub/news',
    '/hub/article',
    '/hub/article/wsop-main-event',
    '/hub/wire',
    '/hub/magazine',
  ]) {
    assert.equal(
      isInteractiveConversionRoute(editorialRoute),
      false,
      `Pure editorial route ${editorialRoute} must not be classified as an interactive conversion route`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: editorialRoute, viewportWidth: 390, scrollRatio: 0.35 }),
      false,
      `Pure editorial route ${editorialRoute} must keep immediate Weekly Wire capture on mobile`,
    );
    assert.equal(
      isNewsletterCaptureRoute(editorialRoute),
      true,
      `isNewsletterCaptureRoute must stay true for ${editorialRoute}`,
    );
  }

  // Print/table-tent exclusions in isNewsletterCaptureRoute stay intact
  assert.equal(isNewsletterCaptureRoute('/hub/magazine/print/2026-11'), false);
  assert.equal(isNewsletterCaptureRoute('/hub/magazine/table-tent/bellagio'), false);
});

// ── LAW 2: Peak-Utility PWA Install Activation & Listener Wiring ────────────
test('OTC TIER 5 LAW 2: PWAInstallPrompt exports resolvePeakUtilityPwaCopy, wires sp:peak-utility-pwa with auth/install/snooze guards, and stays free of lib/analytics bloat', async () => {
  const pwaSrc = read('src/components/ui/PWAInstallPrompt.jsx');
  const barSrc = read('src/components/news/NewsletterCaptureBar.js');

  assert.match(pwaSrc, /export function resolvePeakUtilityPwaCopy/);
  assert.match(pwaSrc, /window\.addEventListener\('sp:peak-utility-pwa',\s*onPeakUtility\)/);
  assert.match(pwaSrc, /window\.removeEventListener\('sp:peak-utility-pwa',\s*onPeakUtility\)/);
  assert.doesNotMatch(pwaSrc, /lib\/analytics/, 'PWAInstallPrompt.jsx must not import lib/analytics');
  assert.doesNotMatch(barSrc, /lib\/analytics/, 'NewsletterCaptureBar.js must not import lib/analytics');

  let now = Date.parse('2026-11-28T06:00:00Z');
  let route = '/hub/series/5001355';
  let authChange;
  let runningAsApp = false;
  let knownInstalled = false;
  let installable = true;
  let unsubscribedAuth = 0;
  const storage = new Map();
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 0;

  const mockWindow = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(ev) {
      for (const fn of [...(listeners.get(ev.type) || [])]) fn(ev);
    },
  };

  const mod = { exports: {} };
  const compiled = ts.transpileModule(pwaSrc, {
    fileName: 'PWAInstallPrompt.jsx',
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  vm.runInNewContext(compiled, {
    exports: mod.exports,
    module: mod,
    console: { log() {}, warn() {}, error() {} },
    window: mockWindow,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storage.set(k, String(v)); },
    },
    setTimeout: (fn, delay) => {
      const id = ++nextTimer;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: async () => ({}),
    require: (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === 'next/router') return { useRouter: () => ({ pathname: route }) };
      if (name.endsWith('/supabase')) {
        return {
          supabase: {
            auth: {
              onAuthStateChange: (fn) => {
                authChange = fn;
                return { data: { subscription: { unsubscribe: () => { unsubscribedAuth += 1; } } } };
              },
            },
          },
        };
      }
      if (name.endsWith('/signupExperience.mjs')) {
        return { installPromptDelay: (user, pathArg) => installPromptDelay(user, pathArg, now) };
      }
      if (name.endsWith('/pwaInstall')) {
        return {
          isRunningAsApp: () => runningAsApp,
          isKnownInstalled: () => knownInstalled,
          isInstallable: () => installable,
          canPromptInstall: () => true,
          isIos: () => false,
          subscribeInstallState: () => () => {},
          PWA_INSTALLED_KEY: 'sp_pwa_installed',
        };
      }
      if (name.endsWith('/promptMaterials')) return {};
      if (name.endsWith('/InstallAppSheet')) return { default: () => null };
      throw new Error(`Unexpected PWAInstallPrompt import: ${name}`);
    },
  });

  const { default: PWAInstallPrompt, resolvePeakUtilityPwaCopy } = mod.exports;

  // 1) Pure resolvePeakUtilityPwaCopy contract
  assert.equal(
    resolvePeakUtilityPwaCopy('series-alerts-event-reminder'),
    'Install Smarter.Poker For 1-Tap Tournament Alerts',
  );
  assert.equal(
    resolvePeakUtilityPwaCopy('  Series-Alerts-Event-Reminder '),
    'Install Smarter.Poker For 1-Tap Tournament Alerts',
  );
  for (const localKey of [
    'local-state-rooms',
    'local-city-rooms',
    'local-game-rooms',
    'local-corridor-rooms',
    'live-venue-intel',
  ]) {
    assert.equal(
      resolvePeakUtilityPwaCopy(localKey),
      'Install Smarter.Poker For Live Waitlists & Room Alerts',
      `resolvePeakUtilityPwaCopy(${localKey}) mismatch`,
    );
  }
  for (const gtoKey of ['gto-leak-finder-report', 'training-gto', 'solver-matrix']) {
    assert.equal(
      resolvePeakUtilityPwaCopy(gtoKey),
      'Install Smarter.Poker For 1-Tap Daily GTO Drills',
      `resolvePeakUtilityPwaCopy(${gtoKey}) mismatch`,
    );
  }
  for (const fallbackKey of ['', null, undefined, 'free-account', 'unknown-unlock']) {
    assert.equal(
      resolvePeakUtilityPwaCopy(fallbackKey),
      'Add Smarter.Poker To Your Home Screen For Instant Alerts',
    );
  }

  // 2) Mounted component peak-utility activation + guards + cleanup
  let tree;
  await act(async () => {
    tree = create(React.createElement(PWAInstallPrompt));
  });
  assert.equal(listeners.get('sp:peak-utility-pwa')?.size, 1, 'Listener must register on mount');

  // Signed-out user must NOT see prompt on sp:peak-utility-pwa
  await act(async () => {
    mockWindow.dispatchEvent({ type: 'sp:peak-utility-pwa', detail: { unlockKey: 'series-alerts-event-reminder' } });
  });
  assert.equal(tree.toJSON(), null, 'Signed-out user must stay hidden on sp:peak-utility-pwa');

  // Sign in a brand-new user (account age 10s) on an auth route -> must stay hidden
  const user = { id: 'peak-player-1', created_at: new Date(now - 10_000).toISOString() };
  route = '/auth/signup';
  await act(async () => {
    tree.update(React.createElement(PWAInstallPrompt));
    authChange('SIGNED_IN', { user });
  });
  await act(async () => {
    mockWindow.dispatchEvent({ type: 'sp:peak-utility-pwa', detail: { unlockKey: 'series-alerts-event-reminder' } });
  });
  assert.equal(tree.toJSON(), null, 'Auth route must block sp:peak-utility-pwa');

  // Move to non-auth route while already installed / running as app / not installable -> must stay hidden
  route = '/hub/series/5001355';
  await act(async () => { tree.update(React.createElement(PWAInstallPrompt)); });

  runningAsApp = true;
  await act(async () => {
    mockWindow.dispatchEvent({ type: 'sp:peak-utility-pwa', detail: { unlockKey: 'series-alerts-event-reminder' } });
  });
  assert.equal(tree.toJSON(), null, 'Standalone app must stay hidden on sp:peak-utility-pwa');
  runningAsApp = false;

  knownInstalled = true;
  await act(async () => {
    mockWindow.dispatchEvent({ type: 'sp:peak-utility-pwa', detail: { unlockKey: 'series-alerts-event-reminder' } });
  });
  assert.equal(tree.toJSON(), null, 'Known installed device must stay hidden on sp:peak-utility-pwa');
  knownInstalled = false;

  installable = false;
  await act(async () => {
    mockWindow.dispatchEvent({ type: 'sp:peak-utility-pwa', detail: { unlockKey: 'series-alerts-event-reminder' } });
  });
  assert.equal(tree.toJSON(), null, 'Non-installable browser must stay hidden on sp:peak-utility-pwa');
  installable = true;

  // Eligible signed-in user on non-auth route -> surfaces immediately with contextual copy
  await act(async () => {
    mockWindow.dispatchEvent({ type: 'sp:peak-utility-pwa', detail: { unlockKey: 'series-alerts-event-reminder' } });
  });
  assert.equal(tree.root.findByProps({ 'data-startup-prompt': 'install' }).type, 'div');
  assert.equal(
    tree.root.findByProps({ className: 'sp-pwa-install-sub' }).children.join(''),
    'Install Smarter.Poker For 1-Tap Tournament Alerts',
  );

  // Local room unlock updates contextual copy
  await act(async () => {
    mockWindow.dispatchEvent({ type: 'sp:peak-utility-pwa', detail: { unlockKey: 'local-state-rooms' } });
  });
  assert.equal(
    tree.root.findByProps({ className: 'sp-pwa-install-sub' }).children.join(''),
    'Install Smarter.Poker For Live Waitlists & Room Alerts',
  );

  // GTO drill unlock updates contextual copy
  await act(async () => {
    mockWindow.dispatchEvent({ type: 'sp:peak-utility-pwa', detail: { unlockKey: 'solver-matrix' } });
  });
  assert.equal(
    tree.root.findByProps({ className: 'sp-pwa-install-sub' }).children.join(''),
    'Install Smarter.Poker For 1-Tap Daily GTO Drills',
  );

  // Clicking Later snoozes and blocks subsequent sp:peak-utility-pwa dispatches
  await act(async () => {
    tree.root.findByProps({ className: 'sp-pwa-install-later' }).props.onClick();
  });
  assert.equal(tree.toJSON(), null, 'Later must hide the prompt');
  await act(async () => {
    mockWindow.dispatchEvent({ type: 'sp:peak-utility-pwa', detail: { unlockKey: 'series-alerts-event-reminder' } });
  });
  assert.equal(tree.toJSON(), null, 'Snoozed prompt must not reappear on sp:peak-utility-pwa');

  // Unmount cleans up sp:peak-utility-pwa listener and auth subscription
  await act(async () => { tree.unmount(); });
  assert.equal(listeners.get('sp:peak-utility-pwa')?.size, 0, 'Unmount must remove sp:peak-utility-pwa listener');
  assert.equal(unsubscribedAuth, 1);
});
