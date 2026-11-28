/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OTC TIER 8 CI FORTRESS: RETURNING-GUEST CONTINUITY PILL + 60-SECOND DAY-0
 *  INTENT ROUTER & TIERED 2-SIDED REFERRAL MILESTONES (2026-11-28)
 * ═══════════════════════════════════════════════════════════════════════════
 * Permanent regression locks for:
 *   1. src/components/seo/ReturningGuestSyncPill.jsx + GuestConversionBar.jsx:
 *      - Loaded via next/dynamic(() => import('./ReturningGuestSyncPill'), { ssr: false })
 *        so pages/_app.js stays strictly <= 100 static modules.
 *      - Pure recordGuestVisitCount(storage) (sp_visit_count_v1) and
 *        shouldShowReturningGuestPill({ visitCount, savedSpotCount, dismissed })
 *        (true ONLY when visitCount >= 2 && savedSpotCount >= 1 && !dismissed).
 *      - #SMARTERDESIGN pill (data-testid="returning-guest-sync-pill", #0b1120,
 *        1px solid #38bdf8, 0px corners, >=44px touch targets) with CTA
 *        data-testid="returning-guest-sync-cta" ("Sync Free In 1 Tap") wired to
 *        openQuickSignup(unlockKey='returning-guest-sync', source='returning-guest-pill')
 *        + canonical F1 event seo_calculator_save_bar_click + dismiss button
 *        persisting sessionStorage['sp_returning_pill_dismissed_v1'].
 *   2. src/components/seo/Day0IntentRouter.jsx + SmarterUnlockedWelcomeBanner.jsx:
 *      - Dynamically loaded post-signup with ZERO static supabase/analytics imports.
 *      - Day-0 Intent Router (data-testid="day0-intent-router") with 3 sharp-corner
 *        >=44px flex-wrapping tiles:
 *          1. Crush Cash & MTTs (GTO) -> /hub/training
 *          2. Play Live Poker Rooms -> /hub/poker-near-me
 *          3. Track My Bankroll -> /hub/bankroll-manager
 *        persisting to localStorage['sp_day0_intent_v1'] and tracking F1 event
 *        seo_post_signup_day0_win_click with { intentId }.
 *      - Tiered 2-Sided Referral Milestones (data-testid="tiered-referral-milestones")
 *        rendered beside Invite A Poker Friend button:
 *        "1 Friend: 500 Diamonds" · "3 Friends: +30 Days VIP" · "5 Friends: Pro Badge".
 *      - 'returning-guest-sync' present in UNLOCK_COPY_MAP.
 *   3. Global hygiene: zero em/en dashes, zero banned gold hexes, zero static
 *      lib/supabase or lib/analytics imports, canonical F1 events only, and
 *      pages/_app.js static graph strictly <= 100 modules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SEO_FUNNEL_EVENTS } from '../src/lib/acquisition/seoFunnelRollup.mjs';

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
    setItem: (k, v) => {
      map.set(String(k), String(v));
    },
    removeItem: (k) => {
      map.delete(String(k));
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
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

function extractText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.children) return node.children.map(extractText).join('');
  return '';
}

function walkStaticShellGraph(entry) {
  const resolveSpec = (spec, from) => {
    if (!spec.startsWith('.')) return null;
    const base = path.normalize(path.join(path.dirname(from), spec));
    for (const c of [
      base,
      `${base}.js`,
      `${base}.jsx`,
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, 'index.js'),
      path.join(base, 'index.jsx'),
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
    ]) {
      const full = path.join(ROOT, c);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return c;
    }
    return null;
  };

  const staticImports = (file) => {
    let src = read(file);
    src = src.replace(/dynamic\(\s*\(\)\s*=>\s*import\([^)]*\)/g, 'dynamic(0');
    return [...src.matchAll(/^\s*import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  };

  const files = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (files.has(f)) continue;
    files.add(f);
    for (const spec of staticImports(f)) {
      const r = resolveSpec(spec, f);
      if (r && !files.has(r)) stack.push(r);
    }
  }
  return files;
}

test('OTC-T8 LAW 1: ReturningGuestSyncPill gates strictly on visitCount >= 2 && savedSpotCount >= 1 && !dismissed, wires 1-tap sync CTA + F1 telemetry + session dismiss', async () => {
  const quickSignupCalls = [];
  const funnelEvents = [];

  const pillMod = compileModule('src/components/seo/ReturningGuestSyncPill.jsx', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === './SmarterQuickSignupSheet') {
      return { openQuickSignup: (payload) => quickSignupCalls.push(payload) };
    }
    if (name.endsWith('/seoFunnelTelemetry')) {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    throw new Error(`Unexpected import in ReturningGuestSyncPill: ${name}`);
  });

  // Pure helper assertions: recordGuestVisitCount
  const mem = makeMemoryStorage();
  assert.equal(pillMod.recordGuestVisitCount(null), 0);
  assert.equal(pillMod.recordGuestVisitCount(mem), 1);
  assert.equal(mem.getItem('sp_visit_count_v1'), '1');
  assert.equal(pillMod.recordGuestVisitCount(mem), 2);
  assert.equal(mem.getItem('sp_visit_count_v1'), '2');
  mem.setItem('sp_visit_count_v1', 'not-a-number');
  assert.equal(pillMod.recordGuestVisitCount(mem), 1);

  // Pure helper assertions: shouldShowReturningGuestPill
  assert.equal(pillMod.shouldShowReturningGuestPill({ visitCount: 0, savedSpotCount: 2, dismissed: false }), false);
  assert.equal(pillMod.shouldShowReturningGuestPill({ visitCount: 1, savedSpotCount: 2, dismissed: false }), false);
  assert.equal(pillMod.shouldShowReturningGuestPill({ visitCount: 2, savedSpotCount: 0, dismissed: false }), false);
  assert.equal(pillMod.shouldShowReturningGuestPill({ visitCount: 2, savedSpotCount: 1, dismissed: true }), false);
  assert.equal(pillMod.shouldShowReturningGuestPill({ visitCount: 2, savedSpotCount: 1, dismissed: false }), true);
  assert.equal(pillMod.shouldShowReturningGuestPill({ visitCount: 5, savedSpotCount: 4, dismissed: false }), true);
  assert.equal(pillMod.shouldShowReturningGuestPill({}), false);

  const prevWindow = globalThis.window;

  // Case A: First-time visitor (visitCount 0 -> 1) with saved spots -> MUST NOT render
  const localA = makeMemoryStorage();
  const sessionA = makeMemoryStorage();
  localA.setItem('sp_saved_spots_v1', JSON.stringify([{ id: 'spot-1' }]));
  globalThis.window = {
    localStorage: localA,
    sessionStorage: sessionA,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(pillMod.default, { currentPath: '/tools/pot-odds-calculator', signedIn: false }),
      );
    });
    assert.equal(tree.toJSON(), null, 'First-time guest (visit 1) must not see returning-guest pill');
    assert.equal(localA.getItem('sp_visit_count_v1'), '1');
    await renderer.act(async () => tree.unmount());

    // Case B: Returning visitor (visit 1 -> 2) with 1 saved spot (singular copy) -> renders pill
    const sessionB = makeMemoryStorage();
    globalThis.window = {
      localStorage: localA,
      sessionStorage: sessionB,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(pillMod.default, { currentPath: '/tools/pot-odds-calculator', signedIn: false }),
      );
    });
    assert.equal(localA.getItem('sp_visit_count_v1'), '2');
    const pillSingle = tree.root.findByProps({ 'data-testid': 'returning-guest-sync-pill' });
    assert.equal(pillSingle.props.style.background, '#0b1120');
    assert.equal(pillSingle.props.style.borderRadius, 0);
    assert.equal(pillSingle.props.style.borderTop, '1px solid #38bdf8');
    const copySingle = tree.root.findByProps({ 'data-testid': 'returning-guest-sync-copy' });
    assert.equal(
      extractText(copySingle),
      'Welcome Back - Sync Your 1 Saved Spot & Claim Free 30-Day VIP',
    );
    await renderer.act(async () => tree.unmount());

    // Case C: Returning visitor (visit 2 -> 3) with 3 saved spots (plural copy) + CTA click + dismiss
    localA.setItem('sp_saved_spots_v1', JSON.stringify([{ id: 's1' }, { id: 's2' }, { id: 's3' }]));
    const sessionC = makeMemoryStorage();
    globalThis.window = {
      localStorage: localA,
      sessionStorage: sessionC,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(pillMod.default, { currentPath: '/tools/preflop-ranges', signedIn: false }),
      );
    });
    const copyPlural = tree.root.findByProps({ 'data-testid': 'returning-guest-sync-copy' });
    assert.equal(
      extractText(copyPlural),
      'Welcome Back - Sync Your 3 Saved Spots & Claim Free 30-Day VIP',
    );

    const ctaBtn = tree.root.findByProps({ 'data-testid': 'returning-guest-sync-cta' });
    assert.equal(extractText(ctaBtn), 'Sync Free In 1 Tap');
    assert.ok(ctaBtn.props.style.minHeight >= 44, 'CTA button must meet >=44px touch target');
    assert.equal(ctaBtn.props.style.borderRadius, 0, 'CTA button must have 0px sharp corners');

    await renderer.act(async () => {
      ctaBtn.props.onClick();
    });

    assert.equal(quickSignupCalls.length, 1);
    assert.equal(quickSignupCalls[0].unlockKey, 'returning-guest-sync');
    assert.equal(quickSignupCalls[0].source, 'returning-guest-pill');
    assert.equal(quickSignupCalls[0].redirectPath, '/tools/preflop-ranges');

    assert.ok(
      funnelEvents.some(
        (e) =>
          e.event === 'seo_calculator_save_bar_click' &&
          e.props?.source === 'returning-guest-pill' &&
          e.props?.saved_spot_count === 3,
      ),
      'CTA click must emit existing F1 canonical event seo_calculator_save_bar_click',
    );

    const dismissBtn = tree.root.findByProps({ 'data-testid': 'returning-guest-sync-dismiss' });
    assert.ok(dismissBtn.props.style.minHeight >= 44 && dismissBtn.props.style.minWidth >= 44);
    await renderer.act(async () => {
      dismissBtn.props.onClick();
    });
    assert.equal(sessionC.getItem('sp_returning_pill_dismissed_v1'), '1');
    assert.equal(tree.toJSON(), null, 'Dismissing pill must hide it immediately');
    await renderer.act(async () => tree.unmount());

    // Case D: Signed-in user must never see returning-guest pill
    const sessionD = makeMemoryStorage();
    globalThis.window = {
      localStorage: localA,
      sessionStorage: sessionD,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(pillMod.default, { currentPath: '/tools/preflop-ranges', signedIn: true }),
      );
    });
    assert.equal(tree.toJSON(), null, 'Signed-in user must not see returning-guest pill');
  } finally {
    if (tree) {
      await renderer.act(async () => tree.unmount());
    }
    globalThis.window = prevWindow;
  }
});

test('OTC-T8 LAW 2: GuestConversionBar dynamically imports ReturningGuestSyncPill, WelcomeBanner dynamically loads Day0IntentRouter, and pages/_app.js stays <= 100 static modules', () => {
  const barSrc = read('src/components/seo/GuestConversionBar.jsx');
  const bannerSrc = read('src/components/seo/SmarterUnlockedWelcomeBanner.jsx');

  assert.match(
    barSrc,
    /const ReturningGuestSyncPill = dynamic\(\(\) => import\('\.\/ReturningGuestSyncPill'\),\s*\{\s*ssr:\s*false,?\s*\}\)/,
    'GuestConversionBar must load ReturningGuestSyncPill via next/dynamic(..., { ssr: false })',
  );
  assert.doesNotMatch(
    barSrc,
    /^import\s+.*ReturningGuestSyncPill/m,
    'GuestConversionBar must NEVER statically import ReturningGuestSyncPill',
  );
  assert.match(barSrc, /<ReturningGuestSyncPill\b/);

  assert.match(
    bannerSrc,
    /import\('\.\/Day0IntentRouter'\)/,
    'SmarterUnlockedWelcomeBanner must dynamically load ./Day0IntentRouter',
  );
  assert.doesNotMatch(
    bannerSrc,
    /^import\s+.*Day0IntentRouter/m,
    'SmarterUnlockedWelcomeBanner must NEVER statically import Day0IntentRouter',
  );

  const shellFiles = walkStaticShellGraph('pages/_app.js');
  assert.ok(shellFiles.size > 20, 'Static graph walker sanity check');
  assert.ok(
    shellFiles.size <= 100,
    `pages/_app.js static graph must remain <= 100 modules (got ${shellFiles.size})`,
  );
  assert.equal(
    shellFiles.has('src/components/seo/ReturningGuestSyncPill.jsx'),
    false,
    'ReturningGuestSyncPill.jsx must NOT be in pages/_app.js static graph',
  );
  assert.equal(
    shellFiles.has('src/components/seo/Day0IntentRouter.jsx'),
    false,
    'Day0IntentRouter.jsx must NOT be in pages/_app.js static graph',
  );
});

test('OTC-T8 LAW 3: Day0IntentRouter (3 tiles + localStorage + F1 tracking) & TieredReferralMilestones render inside SmarterUnlockedWelcomeBanner post-signup with returning-guest-sync copy', async () => {
  const funnelEvents = [];
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });
  const linkStub = {
    __esModule: true,
    default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
  };

  const day0Mod = compileModule('src/components/seo/Day0IntentRouter.jsx', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return linkStub;
    if (name.endsWith('/seoFunnelTelemetry')) {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    throw new Error(`Unexpected import in Day0IntentRouter: ${name}`);
  });

  const bannerMod = compileModule('src/components/seo/SmarterUnlockedWelcomeBanner.jsx', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return linkStub;
    if (name === 'next/router') return { useRouter: () => ({ asPath: '/tools/pot-odds-calculator' }) };
    if (name.endsWith('/seoFunnelTelemetry')) {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    if (name.endsWith('.module.css')) return { __esModule: true, default: styleProxy };
    if (name === './Day0IntentRouter') return { __esModule: true, ...day0Mod };
    throw new Error(`Unexpected import in SmarterUnlockedWelcomeBanner: ${name}`);
  });

  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();
  localStore.setItem(
    'smarter-poker-auth',
    JSON.stringify({
      access_token: 'valid_jwt_token_tier8_test',
      user: { id: 'user-t8', user_metadata: { player_number: 9021 } },
    }),
  );
  sessionStore.setItem(
    'sp_just_unlocked_v1',
    JSON.stringify({ unlockKey: 'returning-guest-sync', source: 'returning-guest-pill' }),
  );

  const prevWindow = globalThis.window;
  const prevCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    localStorage: localStore,
    sessionStorage: sessionStore,
    location: { pathname: '/tools/pot-odds-calculator' },
    dispatchEvent: () => {},
  };

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(bannerMod.default));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Verify returning-guest-sync copy from UNLOCK_COPY_MAP renders
    const fullBannerText = extractText(tree.toJSON());
    assert.match(
      fullBannerText,
      /Welcome Back - Your Saved Spots Are Synced & Your Free 30-Day VIP Offer Is Ready\./,
      'UNLOCK_COPY_MAP must provide tailored copy for returning-guest-sync',
    );

    // Verify Day-0 Intent Router renders all 3 sharp-corner >=44px destination tiles
    const routerBlock = tree.root.findByProps({ 'data-testid': 'day0-intent-router' });
    assert.ok(routerBlock, 'day0-intent-router must render inside SmarterUnlockedWelcomeBanner');

    const expectedTiles = [
      { id: 'crush-gto', label: 'Crush Cash & MTTs (GTO)', href: '/hub/training' },
      { id: 'play-live-rooms', label: 'Play Live Poker Rooms', href: '/hub/poker-near-me' },
      { id: 'track-bankroll', label: 'Track My Bankroll', href: '/hub/bankroll-manager' },
    ];

    for (const tile of expectedTiles) {
      const el = tree.root.findByProps({ 'data-testid': `day0-intent-tile-${tile.id}` });
      assert.equal(el.props.href, tile.href, `Tile ${tile.id} must link to ${tile.href}`);
      assert.ok(extractText(el).includes(tile.label), `Tile ${tile.id} must display "${tile.label}"`);
      assert.equal(el.props.style.borderRadius, 0, `Tile ${tile.id} must use 0px sharp corners`);
      assert.ok(el.props.style.minHeight >= 44, `Tile ${tile.id} must be >= 44px tall`);

      await renderer.act(async () => {
        el.props.onClick();
      });

      assert.equal(
        localStore.getItem('sp_day0_intent_v1'),
        tile.id,
        `Clicking ${tile.id} must persist to localStorage['sp_day0_intent_v1']`,
      );
      assert.ok(
        funnelEvents.some(
          (e) => e.event === 'seo_post_signup_day0_win_click' && e.props?.intentId === tile.id,
        ),
        `Clicking ${tile.id} must track seo_post_signup_day0_win_click with { intentId: '${tile.id}' }`,
      );
    }

    // Verify Tiered 2-Sided Referral Milestones strip renders inside referral bar beside Invite button
    const referralBar = tree.root.findByProps({ 'data-testid': 'unlocked-banner-referral-bar' });
    const milestones = referralBar.findByProps({ 'data-testid': 'tiered-referral-milestones' });
    const inviteBtn = referralBar.findByProps({ 'data-testid': 'unlocked-banner-invite-btn' });
    assert.ok(milestones, 'tiered-referral-milestones must sit inside unlocked-banner-referral-bar');
    assert.ok(inviteBtn, 'Invite A Poker Friend button must remain alongside milestones');
    assert.equal(milestones.props.style.borderRadius, 0);

    const milestoneText = extractText(milestones);
    assert.ok(milestoneText.includes('1 Friend: 500 Diamonds'), 'Must display 1 Friend tier');
    assert.ok(milestoneText.includes('3 Friends: +30 Days VIP'), 'Must display 3 Friends tier');
    assert.ok(milestoneText.includes('5 Friends: Pro Badge'), 'Must display 5 Friends tier');
  } finally {
    if (tree) {
      await renderer.act(async () => tree.unmount());
    }
    globalThis.window = prevWindow;
    globalThis.CustomEvent = prevCustomEvent;
  }
});

test('OTC-T8 LAW 4: All 4 owned files enforce zero em/en dashes, zero banned gold, zero static supabase/analytics imports, and F1 canonical telemetry', () => {
  const ownedComponents = [
    'src/components/seo/ReturningGuestSyncPill.jsx',
    'src/components/seo/GuestConversionBar.jsx',
    'src/components/seo/Day0IntentRouter.jsx',
    'src/components/seo/SmarterUnlockedWelcomeBanner.jsx',
  ];

  const canonicalEvents = new Set(SEO_FUNNEL_EVENTS);
  const eventRe = /trackSeoFunnelEvent\(\s*['"](seo_[a-z0-9_]+)['"]/g;

  for (const rel of ownedComponents) {
    const src = read(rel);
    assert.doesNotMatch(src, /[\u2014\u2013]/, `${rel} must contain ZERO em or en dashes`);
    assert.doesNotMatch(src, BANNED_GOLD, `${rel} must contain ZERO banned gold hex colors`);
    assert.doesNotMatch(
      src,
      /^import\s+.*from\s+['"][^'"]*(?:lib\/supabase|lib\/analytics)['"]/m,
      `${rel} must contain ZERO static lib/supabase or lib/analytics imports`,
    );

    if (rel.endsWith('ReturningGuestSyncPill.jsx') || rel.endsWith('Day0IntentRouter.jsx')) {
      let m;
      while ((m = eventRe.exec(src)) !== null) {
        assert.ok(
          canonicalEvents.has(m[1]),
          `${rel} emitted non-canonical event '${m[1]}' not in SEO_FUNNEL_EVENTS`,
        );
      }
    }
  }
});
