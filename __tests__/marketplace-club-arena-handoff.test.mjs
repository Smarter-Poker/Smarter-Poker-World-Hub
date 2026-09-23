/**
 * THE CLUB ARENA HANDOFF
 * ─────────────────────────────────────────────────────────────────────────
 * Club Arena's marketplace hands players to the World Hub marketplace pages,
 * and it shows them in the one sanctioned same-origin iframe (its HubFrame),
 * beside a running poker table. Two World Hub gaps had to close first.
 *
 * PAYMENTS. A card checkout used to navigate THAT FRAME to Stripe. Stripe
 * Checkout answers with X-Frame-Options: DENY and vercel.json sends
 * Permissions-Policy: payment=(), so the frame would go blank with Apple Pay
 * and Google Pay already disabled - at the exact moment a player is paying.
 * HubFrame catches off-site ANCHOR clicks itself and says the rest out loud:
 * "a programmatic redirect off-site is the hub page's own to break out of".
 *
 * PARITY. /hub/club-shop has three sub-views in component state, so a link
 * could only ever open the storefront. `?view=` selects one on arrival - and
 * has to survive the route-identity and account effects that reset the
 * sub-view to 'store', without ever showing a non-operator an operator panel.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  leaveForCheckout,
  resolveCheckoutNavigation,
} from '../src/lib/store/leaveForCheckout.mjs';
import {
  normalizeClubShopDeepLinkView,
  resolveClubShopDeepLinkSubTab,
} from '../src/lib/store/clubShopDeepLinkView.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const STRIPE = 'https://checkout.stripe.com/c/pay/cs_test_verified';

/** A window that records what it was asked to navigate. */
function fakeWindow({ top = 'self', topThrows = false, assignThrows = false } = {}) {
  const navigated = [];
  const win = {
    navigated,
    location: { assign: (url) => navigated.push(['self', url]) },
  };
  const topWindow =
    top === 'self'
      ? win
      : {
          location: {
            href: 'https://smarter.poker/hub/club-arena/',
            assign: (url) => {
              if (assignThrows) throw new Error('SecurityError');
              navigated.push(['top', url]);
            },
          },
        };
  Object.defineProperty(win, 'top', {
    get() {
      if (topThrows) throw new Error('SecurityError: blocked a frame from accessing a cross-origin frame');
      return topWindow;
    },
  });
  return win;
}

/** A framed window whose top is cross-origin: reading its location throws. */
function crossOriginTopWindow() {
  const navigated = [];
  const win = {
    navigated,
    location: { assign: (url) => navigated.push(['self', url]) },
    top: {
      get location() {
        throw new Error('SecurityError: blocked a frame from accessing a cross-origin frame');
      },
    },
  };
  return win;
}

// ─── CHANGE A: the break-out decision ────────────────────────────────────

test('framed under a reachable same-origin top: checkout navigates the TOP window', () => {
  const win = fakeWindow({ top: 'framed' });
  assert.deepEqual(resolveCheckoutNavigation(STRIPE, win), { target: 'top', url: STRIPE });
  assert.equal(leaveForCheckout(STRIPE, win), 'top');
  assert.deepEqual(win.navigated, [['top', STRIPE]]);
});

test('not framed: checkout navigates this window, exactly as before', () => {
  const win = fakeWindow({ top: 'self' });
  assert.deepEqual(resolveCheckoutNavigation(STRIPE, win), { target: 'self', url: STRIPE });
  assert.equal(leaveForCheckout(STRIPE, win), 'self');
  assert.deepEqual(win.navigated, [['self', STRIPE]]);
});

test('unreachable top (reading window.top throws): checkout stays in this window', () => {
  const win = fakeWindow({ top: 'framed', topThrows: true });
  assert.deepEqual(resolveCheckoutNavigation(STRIPE, win), { target: 'self', url: STRIPE });
  assert.equal(leaveForCheckout(STRIPE, win), 'self');
  assert.deepEqual(win.navigated, [['self', STRIPE]]);
});

test('cross-origin top (reading top.location throws): checkout stays in this window', () => {
  const win = crossOriginTopWindow();
  assert.deepEqual(resolveCheckoutNavigation(STRIPE, win), { target: 'self', url: STRIPE });
  assert.equal(leaveForCheckout(STRIPE, win), 'self');
  assert.deepEqual(win.navigated, [['self', STRIPE]]);
});

test('a top that becomes unreachable between the check and the call still pays here', () => {
  const win = fakeWindow({ top: 'framed', assignThrows: true });
  assert.equal(leaveForCheckout(STRIPE, win), 'self');
  assert.deepEqual(win.navigated, [['self', STRIPE]]);
});

test('a value that is not an absolute HTTPS URL navigates NOTHING', () => {
  for (const value of [
    'http://checkout.stripe.com/c/pay/cs_test',
    'javascript:alert(1)',
    '//checkout.stripe.com/c/pay/cs_test',
    '/hub/diamond-store',
    'checkout.stripe.com/c/pay/cs_test',
    'https://user:pass@checkout.stripe.com/c/pay/cs_test',
    '',
    '   ',
    null,
    undefined,
    { url: STRIPE },
    ['https://checkout.stripe.com/c/pay/cs_test'],
  ]) {
    for (const win of [fakeWindow({ top: 'framed' }), fakeWindow({ top: 'self' })]) {
      assert.deepEqual(
        resolveCheckoutNavigation(value, win),
        { target: 'none', url: null },
        `refused: ${String(value)}`
      );
      assert.equal(leaveForCheckout(value, win), null);
      assert.deepEqual(win.navigated, [], `navigated on refused value: ${String(value)}`);
    }
  }
});

test('with no window at all (server render) leaveForCheckout refuses instead of throwing', () => {
  assert.deepEqual(resolveCheckoutNavigation(STRIPE, null), { target: 'none', url: null });
  assert.equal(leaveForCheckout(STRIPE, null), null);
  assert.equal(leaveForCheckout(STRIPE, undefined), null);
});

test('every Marketplace checkout caller leaves through the shared break-out', async () => {
  const callers = [
    'pages/hub/diamond-store.js',
    'pages/hub/diamond-store/cart.js',
    'pages/hub/club-shop/[itemId].js',
    'src/components/store/MerchStore.jsx',
    'pages/hub/memory-games.js',
  ];
  for (const path of callers) {
    const source = await read(path);
    assert.match(source, /leaveForCheckout\(checkoutSession\.url\)/, path);
    assert.doesNotMatch(source, /window\.location\.assign\(checkoutSession\.url\)/, path);
  }
});

// ─── CHANGE B: ?view= on the club-shop tab ───────────────────────────────

test('only the two real sub-views are accepted; everything else is the storefront', () => {
  assert.equal(normalizeClubShopDeepLinkView('my-purchases'), 'my-purchases');
  assert.equal(normalizeClubShopDeepLinkView('manage'), 'manage');
  assert.equal(normalizeClubShopDeepLinkView('  MANAGE  '), 'manage');
  // Next.js hands a repeated query parameter over as an array.
  assert.equal(normalizeClubShopDeepLinkView(['manage', 'my-purchases']), 'manage');
  for (const value of ['store', 'Store', 'admin', '', 'manage ; drop', null, undefined, 1, {}, []]) {
    assert.equal(normalizeClubShopDeepLinkView(value), null, `rejected: ${String(value)}`);
  }
});

test('no ?view= keeps today behaviour: the storefront, settled, no admin fetch', () => {
  for (const requested of [null, undefined, 'store', 'nonsense']) {
    assert.deepEqual(resolveClubShopDeepLinkSubTab(requested, { roleResolved: true }), {
      settled: true,
      subTab: 'store',
      loadAdmin: false,
    });
  }
});

test('?view=my-purchases selects it without waiting for the operator role', () => {
  assert.deepEqual(resolveClubShopDeepLinkSubTab('my-purchases', {}), {
    settled: true,
    subTab: 'my-purchases',
    loadAdmin: false,
  });
});

test('?view=manage waits for the role rather than guessing', () => {
  assert.deepEqual(
    resolveClubShopDeepLinkSubTab('manage', { roleResolved: false, isAdmin: false }),
    { settled: false, subTab: 'store', loadAdmin: false }
  );
  // isAdmin cannot be true before the snapshot lands, but never trust it if it is.
  assert.deepEqual(resolveClubShopDeepLinkSubTab('manage', { roleResolved: false, isAdmin: true }), {
    settled: false,
    subTab: 'store',
    loadAdmin: false,
  });
});

test('?view=manage opens Manage for an operator and loads the operator report', () => {
  assert.deepEqual(resolveClubShopDeepLinkSubTab('manage', { roleResolved: true, isAdmin: true }), {
    settled: true,
    subTab: 'manage',
    loadAdmin: true,
  });
});

test('?view=manage for a player who is not an operator falls back to the storefront', () => {
  assert.deepEqual(resolveClubShopDeepLinkSubTab('manage', { roleResolved: true, isAdmin: false }), {
    settled: true,
    subTab: 'store',
    loadAdmin: false,
  });
});

/**
 * A model of the page's arrival sequence. There is no DOM renderer in this
 * repo, so the ORDER is modelled instead: on every account/club identity
 * change the page's own reset effects force the sub-view back to 'store', and
 * the ?view= effect then runs with whatever the role snapshot currently says.
 * This is the same body the page runs, against the same resets.
 */
function arrive(requestedView, timeline) {
  let subTab = 'store';
  let appliedIdentity = null;
  let identity = null;
  let adminLoads = 0;
  let adminLoaded = false;
  const seen = [];
  for (const step of timeline) {
    const nextIdentity = `${step.accountId || ''}|${step.clubId || ''}`;
    if (nextIdentity !== identity) {
      identity = nextIdentity;
      subTab = 'store'; // the route-identity / account reset effects
    }
    const requestIdentity = [requestedView, step.accountId || '', step.clubId || ''].join('|');
    if (requestedView && appliedIdentity !== requestIdentity) {
      const resolution = resolveClubShopDeepLinkSubTab(requestedView, {
        isAdmin: step.isAdmin === true,
        roleResolved: step.snapshotOwned === true,
      });
      if (resolution.settled) {
        appliedIdentity = requestIdentity;
        subTab = resolution.subTab;
        if (resolution.loadAdmin && !adminLoaded) {
          adminLoads += 1;
          adminLoaded = true;
        }
      }
    }
    seen.push(subTab);
  }
  return { subTab, seen, adminLoads };
}

// The real arrival: the account resolves after mount (a reset), then the club
// shop snapshot lands with the operator role (no reset, but now decidable).
const ARRIVAL = [
  { accountId: null, clubId: null, snapshotOwned: false },
  { accountId: 'acct-1', clubId: 'club-1', snapshotOwned: false },
  { accountId: 'acct-1', clubId: 'club-1', snapshotOwned: true, isAdmin: true },
];

test('?view= survives the resets that force the sub-view back to the storefront', () => {
  assert.equal(arrive('my-purchases', ARRIVAL).subTab, 'my-purchases');
  assert.equal(arrive('manage', ARRIVAL).subTab, 'manage');
  assert.equal(arrive('manage', ARRIVAL).adminLoads, 1);
  // No request: the resets stand, exactly as today.
  assert.equal(arrive(null, ARRIVAL).subTab, 'store');
});

test('a non-operator landing on ?view=manage never sees the operator panel, even briefly', () => {
  const run = arrive('manage', [
    { accountId: null, clubId: null, snapshotOwned: false },
    { accountId: 'acct-1', clubId: 'club-1', snapshotOwned: false },
    { accountId: 'acct-1', clubId: 'club-1', snapshotOwned: true, isAdmin: false },
  ]);
  assert.deepEqual(run.seen, ['store', 'store', 'store']);
  assert.equal(run.adminLoads, 0);
});

test('a silent club shop refresh does not re-apply ?view= over the player choice', () => {
  // Land on Manage, click away to the storefront, then let a realtime refresh
  // blip the snapshot. The request is already applied for this identity.
  const timeline = [
    { accountId: 'acct-1', clubId: 'club-1', snapshotOwned: true, isAdmin: true },
    { accountId: 'acct-1', clubId: 'club-1', snapshotOwned: false, isAdmin: false },
    { accountId: 'acct-1', clubId: 'club-1', snapshotOwned: true, isAdmin: true },
  ];
  const run = arrive('manage', timeline);
  assert.equal(run.adminLoads, 1, 'the operator report is fetched once, not per refresh');
  assert.deepEqual(run.seen, ['manage', 'manage', 'manage']);
});

test('switching account re-applies the request instead of losing it to the reset', () => {
  const run = arrive('my-purchases', [
    { accountId: 'acct-1', clubId: 'club-1', snapshotOwned: true },
    { accountId: 'acct-2', clubId: 'club-1', snapshotOwned: true },
  ]);
  assert.deepEqual(run.seen, ['my-purchases', 'my-purchases']);
});

test('the store page applies ?view= after the resets, and only on the club-shop tab', async () => {
  const page = await read('pages/hub/diamond-store.js');
  assert.match(page, /normalizeClubShopDeepLinkView\(router\.query\.view\)/);
  const effect = page.slice(
    page.indexOf('const requestedClubShopView ='),
    page.indexOf('// ═══ Club Shop: Auto-load when tab is restored/deep-linked ═══')
  );
  assert.ok(effect.length > 0, 'the ?view= block was not found where it is wired');
  // Only this tab, and only once the router has its query.
  assert.match(effect, /activeTab !== 'club-shop'/);
  assert.match(effect, /!router\.isReady/);
  // Re-applied per account/club identity, so a reset to 'store' cannot eat it.
  assert.match(effect, /committedStoreAccountId \|\| ''/);
  assert.match(effect, /clubShopClubId \|\| ''/);
  assert.match(effect, /clubShopViewRequestRef\.current === requestIdentity/);
  // The role decides, and landing on Manage loads what clicking it loads.
  assert.match(effect, /roleResolved: clubShopSnapshotOwned/);
  assert.match(effect, /isAdmin: clubShopIsAdmin/);
  assert.match(effect, /if \(!resolution\.settled\) return/);
  assert.match(effect, /if \(resolution\.loadAdmin && !clubShopAdminLoaded\) loadClubShopAdmin\(\)/);
  // The deep link reads the URL; it must never rewrite it.
  assert.doesNotMatch(effect, /router\.(replace|push)\(/);
});

test('the ?view= deep link leaves the legacy ?tab= redirect and Stripe returns alone', async () => {
  const page = await read('pages/hub/diamond-store.js');
  // The legacy deep-link redirect still owns ?tab=, untouched.
  assert.match(page, /const raw = router\.query\.tab;/);
  assert.match(page, /router\.replace\(TAB_ROUTES\[tab\]\)/);
  // Stripe's return parameters are still read and verified where they were.
  assert.match(page, /const rawSuccess = Array\.isArray\(router\.query\.success\)/);
  assert.match(page, /const rawCanceled = Array\.isArray\(router\.query\.canceled\)/);
  // `view` is read in exactly one place and is never written into a route.
  assert.equal((page.match(/router\.query\.view/g) || []).length, 1);
  for (const route of Object.entries({
    diamonds: '/hub/diamond-store',
    vip: '/hub/vip-membership',
    merch: '/hub/merch-store',
    rewards: '/hub/smarter-rewards',
  })) {
    assert.ok(page.includes(`'${route[1]}'`), `${route[0]} route missing`);
  }
  // Only the club-shop tab knows about sub-views at all.
  assert.match(page, /const \[clubShopSubTab, setClubShopSubTab\] = useState\('store'\)/);
});
