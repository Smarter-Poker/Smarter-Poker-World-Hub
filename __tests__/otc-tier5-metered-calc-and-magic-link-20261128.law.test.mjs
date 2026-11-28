/**
 * OTC TIER 5 CI FORTRESS: SOFT-METERED CALCULATOR SESSION MILESTONE
 * & 1-CLICK MAGIC SIGN-IN LINK IN SMARTER QUICK SIGNUP SHEET (2026-11-28)
 *
 * Permanent root-cause regression locks for:
 *   1. SmarterCalculatorSaveBar.jsx:
 *      - Exported CALC_ENGAGEMENTS_SESSION_KEY = 'sp_calc_engagements_v1'
 *      - Exported pure recordCalcEngagement(spotKey, storage) with deduplication,
 *        trimming, 25-item cap, and safe non-throwing error handling.
 *      - Guest mount + sp:seo-tool-engaged tracking rendering a dismissible
 *        #SMARTERDESIGN milestone banner (data-testid="calc-metered-milestone")
 *        at >= 2 studied spots with data-testid="calc-milestone-unlock-cta"
 *        wired to openQuickSignup & seo_calc_milestone_click telemetry while
 *        preserving existing Save Spot & Share Spot buttons.
 *   2. SmarterQuickSignupSheet.jsx:
 *      - Preserves Google OAuth, Facebook OAuth, Email Free Registration form,
 *        Welcome Bonus badge, A/B telemetry, and Live Listed Rooms proof.
 *      - Returning-player fast-track button (data-testid="quick-sheet-magic-link-btn")
 *        invoking supabase.auth.signInWithOtp with shouldCreateUser: false,
 *        recordPendingSeoUnlock, seo_quick_signup_magic_link_sent telemetry,
 *        emerald confirmation (data-testid="quick-sheet-magic-link-sent"),
 *        empty-email guidance, and no-account fallback message.
 *   3. Hygiene across both files: zero em/en dashes, zero lib/analytics imports,
 *      zero banned gold hexes, and 100% valid SmarterSeoKit CSS Module classes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const renderer = require('react-test-renderer');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BANNED_GOLD = /#(f59e0b|eab308|fbbf24|d97706|ffd700|d4af37|facc15|f2b84b|d4a853)\b/i;

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

function compileModule(relPath, customRequire) {
  const source = read(relPath);
  const { outputText } = ts.transpileModule(source, {
    fileName: relPath,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(customRequire, mod, mod.exports);
  return mod.exports;
}

function assertValidCssClasses(relPath) {
  const src = read(relPath);
  const css = read('src/components/seo/SmarterSeoKit.module.css');
  const definedClasses = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]));
  const missing = [];
  for (const m of src.matchAll(/\bstyles\.([A-Za-z][A-Za-z0-9_-]*)\b/g)) {
    if (!definedClasses.has(m[1])) missing.push(`styles.${m[1]}`);
  }
  assert.deepEqual(
    missing,
    [],
    `${relPath} references undefined SmarterSeoKit CSS classes: ${missing.join(', ')}`,
  );
}

test('OTC-T5 LAW 1: recordCalcEngagement deduplicates keys, caps at 25, and fails safely without throwing', () => {
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });
  const mod = compileModule('src/components/seo/SmarterCalculatorSaveBar.jsx', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === './SmarterQuickSignupSheet') return { openQuickSignup: () => {} };
    if (name === '../../lib/seo/seoFunnelTelemetry') return { trackSeoFunnelEvent: () => {} };
    if (name === './SmarterSeoKit.module.css') return { __esModule: true, default: styleProxy };
    throw new Error(`Unexpected SmarterCalculatorSaveBar import: ${name}`);
  });

  assert.equal(mod.CALC_ENGAGEMENTS_SESSION_KEY, 'sp_calc_engagements_v1');
  assert.equal(typeof mod.recordCalcEngagement, 'function');

  const store = makeMemoryStorage();
  assert.equal(mod.recordCalcEngagement('odds:AA vs KK', store), 1);
  assert.equal(mod.recordCalcEngagement('  odds:AA vs KK  ', store), 1, 'Duplicate trimmed keys must deduplicate');
  assert.equal(mod.recordCalcEngagement('', store), 1, 'Empty string must not increment count');
  assert.equal(mod.recordCalcEngagement(null, store), 1, 'Non-string key must not increment or throw');
  assert.equal(mod.recordCalcEngagement('icm:Final Table Bubble', store), 2);

  // Fill past 25 unique spots and verify strict cap at 25
  for (let i = 1; i <= 30; i += 1) {
    mod.recordCalcEngagement(`spot-${i}`, store);
  }
  const stored = JSON.parse(store.getItem('sp_calc_engagements_v1'));
  assert.equal(stored.length, 25, 'Session engagements must be capped at 25');
  assert.equal(mod.recordCalcEngagement('spot-30', store), 25);

  // Corrupted storage payload recovers cleanly
  const badJsonStore = makeMemoryStorage();
  badJsonStore.setItem('sp_calc_engagements_v1', '{not-valid-json');
  assert.equal(mod.recordCalcEngagement('preflop:BTN', badJsonStore), 1);

  // Throwing storage never throws
  const throwingStore = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  assert.equal(mod.recordCalcEngagement('preflop:UTG', throwingStore), 0);
});

test('OTC-T5 LAW 2: SmarterCalculatorSaveBar renders dismissible calc-metered-milestone at >= 2 spots and triggers openQuickSignup + telemetry while keeping Save & Share intact', async () => {
  const rel = 'src/components/seo/SmarterCalculatorSaveBar.jsx';
  const funnelEvents = [];
  const quickSignupCalls = [];
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });

  const mod = compileModule(rel, (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === './SmarterQuickSignupSheet') {
      return { openQuickSignup: (detail) => quickSignupCalls.push(detail) };
    }
    if (name === '../../lib/seo/seoFunnelTelemetry') {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    if (name === './SmarterSeoKit.module.css') return { __esModule: true, default: styleProxy };
    throw new Error(`Unexpected SmarterCalculatorSaveBar import: ${name}`);
  });

  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();
  const listeners = new Map();
  const prevWindow = globalThis.window;

  globalThis.window = {
    localStorage: localStore,
    sessionStorage: sessionStore,
    location: { pathname: '/tools/poker-odds-calculator', search: '' },
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (ev) => {
      for (const fn of listeners.get(ev.type) || []) fn(ev);
    },
  };

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(mod.default, {
          toolSlug: 'poker-odds-calculator',
          toolName: 'Poker Odds Calculator',
          spotTitle: 'AA Vs KK Preflop',
          redirectPath: '/tools/poker-odds-calculator',
        }),
      );
    });

    // Save & Share buttons remain intact, milestone hidden at count = 1
    assert.ok(tree.root.findByProps({ 'data-testid': 'calculator-save-cta-poker-odds-calculator' }));
    assert.ok(tree.root.findByProps({ 'data-testid': 'calculator-share-cta-poker-odds-calculator' }));
    assert.equal(
      tree.root.findAllByProps({ 'data-testid': 'calc-metered-milestone' }).length,
      0,
      'Milestone banner must not show before 2 studied spots',
    );

    // Second spot engagement via sp:seo-tool-engaged triggers milestone banner
    await renderer.act(async () => {
      globalThis.window.dispatchEvent({
        type: 'sp:seo-tool-engaged',
        detail: { toolSlug: 'icm-calculator', spotTitle: 'Final Table Bubble' },
      });
    });

    const milestone = tree.root.findByProps({ 'data-testid': 'calc-metered-milestone' });
    const milestoneText = milestone.findByType('span').children.join('');
    assert.equal(
      milestoneText,
      'Session Milestone: 2 Spots Studied - Save Your Study History & Claim 30-Day Free VIP',
    );

    const unlockCta = tree.root.findByProps({ 'data-testid': 'calc-milestone-unlock-cta' });
    assert.equal(unlockCta.children.join(''), 'Save Study History Free');

    await renderer.act(async () => {
      unlockCta.props.onClick();
    });

    assert.equal(quickSignupCalls.length, 1);
    assert.equal(quickSignupCalls[0].unlockKey, 'calc-session-milestone');
    assert.equal(quickSignupCalls[0].source, 'calc-metered-milestone');
    assert.equal(quickSignupCalls[0].redirectPath, '/tools/poker-odds-calculator');
    assert.equal(quickSignupCalls[0].eyebrow, 'Session Study Milestone');
    assert.equal(quickSignupCalls[0].title, 'Save All Your Studied Spots Free');
    assert.ok(
      funnelEvents.some(
        (e) =>
          e.event === 'seo_calc_milestone_click' &&
          e.props?.tool_slug === 'poker-odds-calculator' &&
          e.props?.count === 2,
      ),
      'Milestone CTA click must track seo_calc_milestone_click with tool_slug and count',
    );

    // Dismissing hides only the milestone banner while keeping Save & Share intact
    const dismissBtn = tree.root.findByProps({ 'data-testid': 'calc-milestone-dismiss-btn' });
    await renderer.act(async () => {
      dismissBtn.props.onClick();
    });
    assert.equal(tree.root.findAllByProps({ 'data-testid': 'calc-metered-milestone' }).length, 0);
    assert.ok(tree.root.findByProps({ 'data-testid': 'calculator-save-cta-poker-odds-calculator' }));
    assert.ok(tree.root.findByProps({ 'data-testid': 'calculator-share-cta-poker-odds-calculator' }));
  } finally {
    if (tree) {
      await renderer.act(async () => tree.unmount());
    }
    globalThis.window = prevWindow;
  }
});

test('OTC-T5 LAW 3: SmarterQuickSignupSheet wires returning-player 1-Click Magic Sign-In Link with shouldCreateUser: false while keeping all existing controls intact', async () => {
  const rel = 'src/components/seo/SmarterQuickSignupSheet.jsx';
  const src = read(rel);

  assert.match(src, /data-testid="quick-sheet-magic-link-btn"/);
  assert.match(src, /data-testid="quick-sheet-magic-link-sent"/);
  assert.match(src, /Already Have An Account\? Email 1-Click Magic Sign-In Link/);
  assert.match(src, /supabase\.auth\.signInWithOtp\(/);
  assert.match(src, /shouldCreateUser:\s*false/);
  assert.match(src, /seo_quick_signup_magic_link_sent/);

  const funnelEvents = [];
  const pendingUnlocks = [];
  const otpCalls = [];
  let nextOtpResponse = { data: {}, error: null };
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });
  const linkStub = {
    __esModule: true,
    default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
  };

  const mod = compileModule(rel, (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return linkStub;
    if (name === 'next/router') return { useRouter: () => ({ asPath: '/tools/icm-calculator', push: () => {} }) };
    if (name === '../../lib/supabase') {
      return {
        supabase: {
          auth: {
            signInWithOAuth: async () => ({ error: null }),
            signInWithOtp: async (arg) => {
              otpCalls.push(arg);
              return nextOtpResponse;
            },
          },
        },
      };
    }
    if (name === '../../lib/seo/seoFunnelTelemetry') {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    if (name === '../../lib/seo/seoExperiment') {
      return {
        getSeoOfferExperiment: () => 'welcome-vip-500',
        getAiWelcomeContext: () => null,
      };
    }
    if (name === './SmarterUnlockedWelcomeBanner') {
      return { recordPendingSeoUnlock: (arg) => pendingUnlocks.push(arg) };
    }
    if (name === '../../lib/acquisition/firstTouch.mjs') {
      return {
        recordFirstTouch: () => null,
        recordUnlockIntent: () => null,
        beginOAuthAttribution: () => null,
        withAttributionNonce: (u) => u,
      };
    }
    if (name === './SmarterSeoKit.module.css') return { __esModule: true, default: styleProxy };
    throw new Error(`Unexpected SmarterQuickSignupSheet import: ${name}`);
  });

  const listeners = new Map();
  const prevWindow = globalThis.window;
  const prevCustomEvent = globalThis.CustomEvent;
  const prevFetch = globalThis.fetch;

  globalThis.CustomEvent = class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.fetch = async () => ({ ok: false });
  globalThis.window = {
    location: { origin: 'https://smarter.poker', pathname: '/tools/icm-calculator' },
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (ev) => {
      for (const fn of listeners.get(ev.type) || []) fn(ev);
    },
  };

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(mod.default));
    });

    // Open quick signup sheet
    await renderer.act(async () => {
      mod.openQuickSignup({
        unlockKey: 'calc-session-milestone',
        source: 'calc-metered-milestone',
        redirectPath: '/tools/icm-calculator',
      });
    });

    // Verify all existing controls remain intact
    assert.ok(tree.root.findByProps({ 'data-testid': 'quick-signup-google-btn' }));
    assert.ok(tree.root.findByProps({ 'data-testid': 'quick-signup-facebook-btn' }));
    assert.ok(tree.root.findByProps({ 'data-testid': 'quick-signup-email-input' }));
    assert.ok(tree.root.findByProps({ 'data-testid': 'quick-signup-email-submit' }));
    assert.ok(tree.root.findByProps({ 'data-testid': 'quick-signup-welcome-offer' }));
    assert.ok(tree.root.findByProps({ 'data-testid': 'quick-signup-live-proof' }));

    const magicBtn = tree.root.findByProps({ 'data-testid': 'quick-sheet-magic-link-btn' });
    assert.equal(magicBtn.children.join(''), 'Already Have An Account? Email 1-Click Magic Sign-In Link');

    // 1) Empty email -> shows clean inline prompt and does NOT call signInWithOtp
    await renderer.act(async () => {
      await magicBtn.props.onClick();
    });
    assert.equal(otpCalls.length, 0);
    const emptyErr = tree.root.findByProps({ 'data-testid': 'quick-sheet-magic-link-error' });
    assert.equal(
      emptyErr.children.join(''),
      'Enter Your Account Email Above To Receive A 1-Click Sign-In Link',
    );

    // 2) Valid existing account email -> calls recordPendingSeoUnlock + telemetry + signInWithOtp({ shouldCreateUser: false })
    const emailInput = tree.root.findByProps({ 'data-testid': 'quick-signup-email-input' });
    await renderer.act(async () => {
      emailInput.props.onChange({ target: { value: 'Returning.Player@Example.com ' } });
    });

    await renderer.act(async () => {
      await tree.root.findByProps({ 'data-testid': 'quick-sheet-magic-link-btn' }).props.onClick();
    });

    assert.equal(otpCalls.length, 1);
    assert.equal(otpCalls[0].email, 'returning.player@example.com');
    assert.equal(otpCalls[0].options.shouldCreateUser, false);
    assert.equal(
      otpCalls[0].options.emailRedirectTo,
      'https://smarter.poker/auth/callback?redirect=%2Ftools%2Ficm-calculator&unlock=calc-session-milestone&src=calc-metered-milestone',
    );
    assert.equal(pendingUnlocks.length, 1);
    assert.equal(pendingUnlocks[0].unlockKey, 'calc-session-milestone');
    assert.ok(
      funnelEvents.some(
        (e) =>
          e.event === 'seo_quick_signup_magic_link_sent' &&
          e.props?.unlock_key === 'calc-session-milestone' &&
          e.props?.experiment_variant === 'welcome-vip-500',
      ),
    );
    const sentBanner = tree.root.findByProps({ 'data-testid': 'quick-sheet-magic-link-sent' });
    assert.equal(
      sentBanner.children.join(''),
      'Magic Sign-In Link Sent! Check Your Inbox To Return Directly Here.',
    );

    // 3) No existing account error -> clean guidance to Create Free Account Above
    nextOtpResponse = { data: null, error: { message: 'Signups not allowed for otp', status: 422 } };
    await renderer.act(async () => {
      await tree.root.findByProps({ 'data-testid': 'quick-sheet-magic-link-btn' }).props.onClick();
    });
    const notFoundErr = tree.root.findByProps({ 'data-testid': 'quick-sheet-magic-link-error' });
    assert.equal(
      notFoundErr.children.join(''),
      'No Existing Account Found For That Email - Click Create Free Account Above.',
    );
  } finally {
    if (tree) {
      await renderer.act(async () => tree.unmount());
    }
    globalThis.window = prevWindow;
    globalThis.CustomEvent = prevCustomEvent;
    globalThis.fetch = prevFetch;
  }
});

test('OTC-T5 LAW 4: Both modified SEO components enforce zero em/en dashes, zero lib/analytics imports, zero banned gold, and 100% valid CSS classes', () => {
  for (const rel of [
    'src/components/seo/SmarterCalculatorSaveBar.jsx',
    'src/components/seo/SmarterQuickSignupSheet.jsx',
  ]) {
    const src = read(rel);
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(codeOnly, /[\u2014\u2013]/, `${rel} must contain zero em or en dashes`);
    assert.doesNotMatch(codeOnly, /lib\/analytics/, `${rel} must never import lib/analytics`);
    assert.doesNotMatch(codeOnly, BANNED_GOLD, `${rel} must never use banned gold hexes`);
    assertValidCssClasses(rel);
  }
});
