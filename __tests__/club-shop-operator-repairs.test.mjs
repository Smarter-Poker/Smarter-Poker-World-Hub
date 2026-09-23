/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE CLUB SHOP OPERATOR REPAIRS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  An audit of the Manage view and the addresses that reach it found controls
 *  that could not succeed, a club that was silently exchanged for another, and
 *  member names rewritten into each other. Each case below is one of them:
 *
 *    1. A legacy `?tab=club-shop&clubId=<uuid>` link redirected to a BARE
 *       /hub/club-shop, so it resolved somebody else's club.
 *    2. The tab rail dropped the club on every hop, so Club Shop -> Diamonds
 *       -> Club Shop landed in a different shop.
 *    3. Buyer names went through the shopper-copy normalizer, which Title-Cases
 *       and rewrites them. ALLIN_ACE read as "Allin Ace", and two different
 *       members could render identically: that is how a refund reaches the
 *       wrong row.
 *    4. The in-place editor offered every field on the platform-managed All
 *       Throwables Pack, though the server refuses the whole update when any of
 *       them differs from the platform constant, naming no field.
 *    5. Delete was DISABLED for a sold item with its only explanation in a
 *       `title`, which no phone and no screen reader can reach, leaving the
 *       guard's own "Hide It Instead" answer as code nothing could run.
 *    6. The ledger's search term followed the operator into the next club and
 *       reported it empty.
 *    7. A checkout that refuses to open returned null and was discarded, so the
 *       shopper saw a redirect toast, a re-enabled Buy button and no redirect.
 *
 *  Deterministic by construction: every case is either a pure function, a
 *  component rendered from props, or a source contract. No network, no clock.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  buildClubShopItemUpdatePayload,
  clubShopItemDeleteGuard,
  clubShopItemIsPlatformManaged,
  createClubShopItemDraft,
} from '../src/lib/store/clubShopItemDraft.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const CLUB_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const CARD_LIMIT = 250000;

const page = read('pages/hub/diamond-store.js');
const editorSource = read('src/components/store/ClubShopItemEditor.jsx');
const ledgerSource = read('src/components/store/ClubShopPurchaseLedger.jsx');
const analyticsSource = read('src/components/store/ClubShopSalesAnalytics.jsx');
const toastSource = read('src/components/store/StoreToast.jsx');
const showcaseSource = read('src/components/diamond-store/SmarterStoreShowcase.jsx');

/** Compile one JSX/ESM source into a live module, resolving its imports. */
function compileModule(path, resolve) {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    fileName: 'component.jsx',
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
  return module.exports;
}

// The REAL copy normalizer, so "a name is rendered raw" is proven against the
// thing that was rewriting it rather than against a stub that never did.
const { marketplaceCopy } = compileModule('src/lib/store/marketplaceCopy.js', (name) =>
  require(name)
);

/**
 * The store page evaluated with every import stubbed. Only its pure exported
 * address helpers are exercised; nothing renders and nothing is fetched.
 */
const storePage = (() => {
  const code = ts.transpileModule(page, {
    fileName: 'diamond-store.jsx',
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const stub = new Proxy(function stubbed() {}, {
    get: (_target, key) => (key === '__esModule' ? true : stub),
    apply: () => stub,
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(() => stub, module, module.exports);
  return module.exports;
})();

// ───────────────────────────────────────────────────────────────────────────
// 1. The legacy ?tab= redirect keeps the rest of the address
// ───────────────────────────────────────────────────────────────────────────

test('a legacy ?tab= link redirects with its club and sub-view intact', () => {
  const { withLegacyTabQuery, TAB_ROUTES } = storePage;
  assert.equal(
    withLegacyTabQuery(TAB_ROUTES['club-shop'], {
      tab: 'club-shop',
      clubId: CLUB_ID,
      view: 'manage',
    }),
    `/hub/club-shop?clubId=${CLUB_ID}&view=manage`
  );
  // `tab` itself is spent by the redirect and never travels on.
  assert.doesNotMatch(
    withLegacyTabQuery(TAB_ROUTES['club-shop'], { tab: 'club-shop', clubId: CLUB_ID }),
    /tab=/
  );
});

test('a bare legacy link still redirects to a bare route, and a repeated key is kept', () => {
  const { withLegacyTabQuery, TAB_ROUTES } = storePage;
  assert.equal(withLegacyTabQuery(TAB_ROUTES.vip, { tab: 'vip' }), '/hub/vip-membership');
  assert.equal(withLegacyTabQuery(TAB_ROUTES.vip, {}), '/hub/vip-membership');
  assert.equal(withLegacyTabQuery(TAB_ROUTES.vip, undefined), '/hub/vip-membership');
  // Next reports a repeated parameter as an array. Both values survive.
  assert.equal(
    withLegacyTabQuery(TAB_ROUTES.merch, { tab: 'merch', ref: ['a', 'b'] }),
    '/hub/merch-store?ref=a&ref=b'
  );
});

test('a Stripe return on a legacy link keeps the parameters the verifier needs', () => {
  const { withLegacyTabQuery, TAB_ROUTES } = storePage;
  const redirect = withLegacyTabQuery(TAB_ROUTES['club-shop'], {
    tab: 'club-shop',
    clubId: CLUB_ID,
    success: 'true',
    session_id: 'cs_test_verified',
  });
  assert.match(redirect, /success=true/);
  assert.match(redirect, /session_id=cs_test_verified/);
  assert.match(redirect, new RegExp(`clubId=${CLUB_ID}`));
});

test('the page performs that redirect rather than dropping the query', () => {
  assert.match(page, /router\.replace\(withLegacyTabQuery\(TAB_ROUTES\[tab\], router\.query\)\)/);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. The club rides the tab rail
// ───────────────────────────────────────────────────────────────────────────

const showcaseModule = compileModule(
  'src/components/diamond-store/SmarterStoreShowcase.jsx',
  (name) => {
    if (name.endsWith('.module.css')) return {};
    if (name.endsWith('/storeAnalytics')) return { captureStoreEvent: () => {} };
    if (name.endsWith('/marketplaceCopy')) return { marketplaceCopy };
    if (name === 'next/link') {
      return {
        __esModule: true,
        default: ({ href, children, ...rest }) =>
          React.createElement('a', { href, ...rest }, children),
      };
    }
    return require(name);
  }
);

const renderShowcase = (props) =>
  renderToStaticMarkup(React.createElement(showcaseModule.default, props));

test('the Club Shop rail link keeps the club the visitor arrived in', () => {
  const { storeTabHref } = showcaseModule;
  assert.equal(storeTabHref('club-shop', CLUB_ID), `/hub/club-shop?clubId=${CLUB_ID}`);
  // And it rides every other destination too, or tapping Diamonds and tapping
  // back would still land in a different club.
  assert.equal(storeTabHref('diamonds', CLUB_ID), `/hub/diamond-store?clubId=${CLUB_ID}`);
  assert.equal(storeTabHref('vip', CLUB_ID), `/hub/vip-membership?clubId=${CLUB_ID}`);
});

test('with no club on screen the rail is exactly the five bare routes it always was', () => {
  const { storeTabHref } = showcaseModule;
  assert.equal(storeTabHref('club-shop', null), '/hub/club-shop');
  assert.equal(storeTabHref('diamonds', undefined), '/hub/diamond-store');
  assert.equal(storeTabHref('rewards', ''), '/hub/smarter-rewards');
  assert.equal(storeTabHref('not-a-tab', CLUB_ID), undefined);
});

test('the rendered rail carries the club, and drops it again when there is none', () => {
  const withClub = renderShowcase({ activeTab: 'diamonds', clubId: CLUB_ID, packages: [] });
  assert.match(withClub, new RegExp(`href="/hub/club-shop\\?clubId=${CLUB_ID}"`));
  const withoutClub = renderShowcase({ activeTab: 'diamonds', packages: [] });
  assert.match(withoutClub, /href="\/hub\/club-shop"/);
  assert.doesNotMatch(withoutClub, /clubId=/);
});

test('the store page hands the rail the club it is actually showing', () => {
  assert.match(page, /<SmarterStoreShowcase\s+activeTab=\{activeTab\}\s+clubId=\{routeClubId \|\| clubShopClubId\}/);
});

// ───────────────────────────────────────────────────────────────────────────
// 3. A member's name is an identity, not shopper copy
// ───────────────────────────────────────────────────────────────────────────

const ledgerModule = compileModule('src/components/store/ClubShopPurchaseLedger.jsx', (name) => {
  if (name.endsWith('.module.css')) return {};
  if (name.endsWith('/marketplaceCopy')) return { marketplaceCopy };
  if (name.endsWith('/boundedCommerceFetch')) return { boundedCommerceFetch: async () => ({}) };
  if (name.endsWith('/checkoutAuthorization')) {
    return { getVerifiedCheckoutAuthorization: async () => null };
  }
  if (name.endsWith('/authUtils')) return { getAuthUser: () => null };
  if (name.endsWith('./StoreToast')) return { showStoreToast: () => {} };
  return require(name);
});

const renderLedger = (props) =>
  renderToStaticMarkup(React.createElement(ledgerModule.ClubShopPurchaseLedgerView, props));

const ledgerRow = (overrides = {}) => ({
  id: '44444444-4444-4444-8444-444444444444',
  itemName: 'ten_second_top_up',
  buyerName: 'ALLIN_ACE',
  pricePaid: 1500,
  currency: 'diamonds',
  createdAt: '2026-08-20T08:00:00.000Z',
  status: 'owned',
  refundable: true,
  ...overrides,
});

test('the normalizer really does rewrite a member name, which is why one is never sent through it', () => {
  // The defect, stated as a fact about the tool: these two members become the
  // same string, and an operator refunding by name cannot tell them apart.
  assert.equal(marketplaceCopy('ALLIN_ACE'), 'Allin Ace');
  assert.equal(marketplaceCopy('allin ace'), 'Allin Ace');
});

test('the ledger prints the member name exactly as the member wrote it', () => {
  const html = renderLedger({ rows: [ledgerRow()], total: 1, loaded: true });
  assert.match(html, /ALLIN_ACE/);
  assert.doesNotMatch(html, /Allin Ace/);
  // And the cell says out loud that it is user content, so the page-level
  // capitalization contract does not put the case back.
  assert.match(html, /data-preserve-case="true" data-user-content="true"/);
  // The ITEM name is shopper copy and keeps the contract.
  assert.match(html, /Ten Second Top Up/);
});

test('the refund control names the member raw, so two members cannot share one label', () => {
  const html = renderLedger({
    rows: [ledgerRow(), ledgerRow({ id: 'second', buyerName: 'Allin Ace' })],
    total: 2,
    loaded: true,
  });
  assert.match(html, /aria-label="Refund Ten Second Top Up For ALLIN_ACE"/);
  assert.match(html, /aria-label="Refund Ten Second Top Up For Allin Ace"/);
});

test('the refund confirmation names the member raw as well', () => {
  assert.match(ledgerSource, /To \$\{row\.buyerName \|\| 'Member'\}\./);
  assert.doesNotMatch(ledgerSource, /marketplaceCopy\(row\.buyerName/);
});

test('the sales report prints a top buyer raw and a top item through the copy contract', () => {
  const analyticsModule = compileModule('src/components/store/ClubShopSalesAnalytics.jsx', (n) => {
    if (n.endsWith('.module.css')) return {};
    if (n.endsWith('/marketplaceCopy')) return { marketplaceCopy };
    if (n.endsWith('/boundedCommerceFetch')) return { boundedCommerceFetch: async () => ({}) };
    if (n.endsWith('/checkoutAuthorization')) {
      return { getVerifiedCheckoutAuthorization: async () => null };
    }
    if (n.endsWith('/authUtils')) return { getAuthUser: () => null };
    return require(n);
  });
  const html = renderToStaticMarkup(
    React.createElement(analyticsModule.ClubShopSalesAnalyticsView, {
      data: {
        totals: {
          grossSales: 1,
          netSales: 1,
          grossRevenue: 10,
          refundedAmount: 0,
          netRevenue: 10,
          uniqueBuyers: 1,
          averageSale: 10,
        },
        series: [{ date: '2026-08-20', sales: 1, revenue: 10, netSales: 1, netRevenue: 10 }],
        topItems: [{ itemId: ITEM_ID, name: 'ten_second_top_up', netSales: 1, netRevenue: 10 }],
        topBuyers: [{ userId: 'buyer-1', name: 'ALLIN_ACE', netPurchases: 1, netSpent: 10 }],
      },
    })
  );
  assert.match(html, /ALLIN_ACE/);
  assert.doesNotMatch(html, /Allin Ace/);
  assert.match(html, /Ten Second Top Up/);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. The platform-managed row is offered only what the server accepts
// ───────────────────────────────────────────────────────────────────────────

const ALL_THROWABLES_NAME = 'All Throwables Pack (10)';

function allThrowablesItem(overrides = {}) {
  return {
    id: ITEM_ID,
    club_id: CLUB_ID,
    name: ALL_THROWABLES_NAME,
    description: 'Ten Uses Across All 49 Table Throwables.',
    price: 900,
    category: 'Throwables',
    item_type: 'throwable',
    image_url: '/hub/club-arena/images/marketplace/throwables/all-throwables-access-v1.png',
    grant_spec: { type: 'throwable', qty: 10 },
    is_active: true,
    stock: null,
    sale_price: null,
    per_user_limit: null,
    available_from: null,
    available_until: null,
    sort_order: 0,
    purchase_count: 0,
    ...overrides,
  };
}

function timeBankItem(overrides = {}) {
  return {
    id: ITEM_ID,
    club_id: CLUB_ID,
    name: 'Ten Second Top Up',
    description: 'Buys One Extra Decision',
    price: 500,
    category: 'Time Banks',
    item_type: 'time_bank',
    image_url: 'https://cdn.example.com/time-bank.png',
    grant_spec: { type: 'time_bank', qty: 3 },
    is_active: true,
    stock: 12,
    sale_price: 400,
    per_user_limit: 2,
    available_from: null,
    available_until: null,
    sort_order: 4,
    purchase_count: 0,
    ...overrides,
  };
}

test('only the one canonical, active pack is treated as platform managed', () => {
  assert.equal(clubShopItemIsPlatformManaged(allThrowablesItem()), true);
  assert.equal(clubShopItemIsPlatformManaged(timeBankItem()), false);
  // A hidden historical Tomato/Snowball/Egg row is a receipt, not the offer.
  assert.equal(clubShopItemIsPlatformManaged(allThrowablesItem({ is_active: false })), false);
  assert.equal(clubShopItemIsPlatformManaged(allThrowablesItem({ name: 'Tomatoes (10)' })), false);
  assert.equal(clubShopItemIsPlatformManaged(null), false);
});

test('a price change on the managed pack sends only terms the server accepts', () => {
  const item = allThrowablesItem();
  const built = buildClubShopItemUpdatePayload({
    clubId: CLUB_ID,
    item,
    draft: { ...createClubShopItemDraft(item), price: '1200', salePrice: '800', stock: '50' },
    maximumCardFundedPrice: CARD_LIMIT,
  });
  assert.equal(built.error, undefined);
  assert.deepEqual(Object.keys(built.payload).sort(), [
    'action',
    'availableFrom',
    'availableUntil',
    'clubId',
    'itemId',
    'price',
    'salePrice',
    'sortOrder',
    'stock',
  ]);
  assert.equal(built.payload.price, 1200);
  assert.equal(built.payload.salePrice, 800);
  assert.equal(built.payload.stock, 50);
  // Every field enforceAllThrowablesMutation compares is ABSENT, because a
  // present-and-equal value is still a requested change to that guard, and one
  // mismatch refuses the whole update without naming a field.
  for (const forbidden of [
    'name',
    'description',
    'category',
    'imageUrl',
    'grantQty',
    'grantRef',
    'perUserLimit',
  ]) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(built.payload, forbidden),
      `${forbidden} must not travel for the platform-managed row`
    );
  }
});

test('an ordinary row still sends every field the retired Manage tab could change', () => {
  const built = buildClubShopItemUpdatePayload({
    clubId: CLUB_ID,
    item: timeBankItem(),
    draft: createClubShopItemDraft(timeBankItem()),
    maximumCardFundedPrice: CARD_LIMIT,
  });
  assert.equal(built.error, undefined);
  for (const kept of ['name', 'description', 'category', 'imageUrl', 'grantQty', 'perUserLimit']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(built.payload, kept),
      `${kept} must still travel for an ordinary row`
    );
  }
});

const draftModule = await import('../src/lib/store/clubShopItemDraft.mjs');

const editorModule = compileModule('src/components/store/ClubShopItemEditor.jsx', (name) => {
  if (name.endsWith('.module.css')) return {};
  if (name.endsWith('/marketplaceCopy')) return { marketplaceCopy };
  if (name.endsWith('clubShopItemDraft.mjs')) return draftModule;
  return require(name);
});

const renderEditor = (props) =>
  renderToStaticMarkup(React.createElement(editorModule.default, props));

test('the editor offers the managed pack exactly the fields the server permits', () => {
  const html = renderEditor({
    item: allThrowablesItem(),
    clubId: CLUB_ID,
    maximumCardFundedPrice: CARD_LIMIT,
  });
  for (const offered of [
    'Price In Diamonds',
    'Sale Price, Blank To End The Sale',
    'Stock Quantity, Blank For Unlimited',
    'Available From',
    'Available Until',
    'Storefront Sort Order',
  ]) {
    assert.match(html, new RegExp(`aria-label="${offered}"`), `${offered} must stay editable`);
  }
  for (const refused of [
    'Item Name',
    'Item Description',
    'Item Category',
    'Item Image URL',
    'Uses Delivered Per Purchase',
    'Maximum Purchases Per Member, Blank For No Cap',
  ]) {
    assert.doesNotMatch(
      html,
      new RegExp(`aria-label="${refused}"`),
      `${refused} is platform managed and must not be offered`
    );
  }
  // And the operator is told why, rather than left to guess.
  assert.match(html, /Is Platform Managed\./);
});

test('an ordinary row keeps every control it had', () => {
  const html = renderEditor({
    item: timeBankItem(),
    clubId: CLUB_ID,
    maximumCardFundedPrice: CARD_LIMIT,
  });
  for (const label of [
    'Item Name',
    'Price In Diamonds',
    'Item Description',
    'Item Category',
    'Item Image URL',
    'Uses Delivered Per Purchase',
    'Stock Quantity, Blank For Unlimited',
    'Sale Price, Blank To End The Sale',
    'Maximum Purchases Per Member, Blank For No Cap',
    'Available From',
    'Available Until',
    'Storefront Sort Order',
  ]) {
    assert.match(html, new RegExp(`aria-label="${label}"`), `${label} must stay editable`);
  }
  assert.doesNotMatch(html, /Is Platform Managed\./);
});

// ───────────────────────────────────────────────────────────────────────────
// 5. The Edit control is only offered where a save can land
// ───────────────────────────────────────────────────────────────────────────

test('a legacy category row is never offered a form the server must refuse', () => {
  // The server's purchasable set (src/lib/club-arena/shopItemRules.js) is the
  // gate, because the editor always sends `category`.
  const declared = page.match(
    /const CLUB_ADMIN_DELIVERABLE_CATEGORIES = Object\.freeze\(\[([\s\S]*?)\]\);/
  );
  assert.ok(declared, 'the deliverable category list is gone');
  assert.match(declared[1], /'Time Banks'/);
  assert.match(declared[1], /'Throwables'/);
  for (const refused of ['Table Skins', 'Emotes', 'Avatars', 'Exclusive']) {
    assert.doesNotMatch(declared[1], new RegExp(refused));
  }
  const rules = read('src/lib/club-arena/shopItemRules.js');
  const serverSet = rules.match(/const PURCHASE_ENABLED_CATEGORIES = Object\.freeze\(\[(.*?)\]\)/);
  assert.ok(serverSet, 'the server purchasable set is gone');
  assert.match(serverSet[1], /'Time Banks'/);
  assert.match(serverSet[1], /'Throwables'/);

  // The row gates the Edit control on it and shows the status pill instead.
  assert.match(page, /isServerEditableAdminItem\(item\) \? \(/);
  assert.match(page, /Legacy Category, Read Only/);
});

test('a row with no category at all is still editable, the way the draft reads it', () => {
  // createClubShopItemDraft defaults a missing category to Time Banks, so the
  // gate has to read it the same way or it would hide a working control.
  const gate = page.slice(
    page.indexOf('const isServerEditableAdminItem'),
    page.indexOf('function vipDiamondPlanKey(')
  );
  assert.match(gate, /String\(item\?\.category \|\| 'Time Banks'\)/);
  assert.equal(createClubShopItemDraft({ id: ITEM_ID }).category, 'Time Banks');
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Delete stays reachable, and the guard is what answers
// ───────────────────────────────────────────────────────────────────────────

test('the guard still refuses a sold item and names the control to use instead', () => {
  const sold = clubShopItemDeleteGuard(timeBankItem({ purchase_count: 3 }));
  assert.equal(sold.canDelete, false);
  assert.match(sold.reason, /Hide It Instead/);
  assert.equal(clubShopItemDeleteGuard(timeBankItem()).canDelete, true);
});

test('the control is reachable, and the click is what runs the guard', () => {
  const row = page.slice(page.indexOf('{clubShopAdminItems.map('), page.indexOf('<ClubShopItemEditor'));
  // Disabled only while another operator action is open. Never on the guard.
  assert.match(row, /disabled=\{!!clubShopAdminActionId\}/);
  assert.doesNotMatch(row, /!clubShopItemDeleteGuard\(item\)\.canDelete/);
  assert.doesNotMatch(row, /!deleteGuard\.canDelete\s*\n?\s*\}/);
  // The click either opens the dialog or says why it cannot.
  assert.match(
    row,
    /deleteGuard\.canDelete\s*\?\s*setClubShopDeleteTarget\(item\)\s*:\s*showStoreToast\('warning', deleteGuard\.reason\)/
  );
  // The reason reaches a screen reader through the name, not only a `title`.
  assert.match(row, /`Delete \$\{marketplaceCopy\(item\.name\)\}\. \$\{deleteGuard\.reason\}`/);
});

test('the "Hide It Instead" answer is no longer unreachable code', () => {
  const handler = page.slice(
    page.indexOf('const handleClubShopAdminAction'),
    page.indexOf('const clubShopIsAdmin =')
  );
  assert.match(handler, /const deleteGuard = clubShopItemDeleteGuard\(item\)/);
  assert.match(handler, /showStoreToast\(\s*'warning',\s*deleteGuard\.reason\s*\)/);
});

test('the guard is computed once per report, not twice per row per render', () => {
  assert.match(page, /const clubShopDeleteGuards = useMemo\(/);
  assert.match(page, /\}, \[clubShopAdminItems\]\)/);
  const row = page.slice(page.indexOf('{clubShopAdminItems.map('), page.indexOf('<ClubShopItemEditor'));
  assert.equal((row.match(/clubShopItemDeleteGuard\(/g) || []).length, 0);
  assert.match(page, /clubShopDeleteGuards\.get\(item\.id\) \|\| EMPTY_DELETE_GUARD/);
});

// ───────────────────────────────────────────────────────────────────────────
// 7. The ledger's search belongs to the club it was typed in
// ───────────────────────────────────────────────────────────────────────────

test('a club or account change clears the search box and the applied term with it', () => {
  const reset = ledgerSource.slice(
    ledgerSource.indexOf('useIsomorphicLayoutEffect(() => {'),
    ledgerSource.indexOf('}, [accountId, clubId]);')
  );
  assert.ok(reset.length > 0, 'the ledger identity reset was not found');
  for (const cleared of [
    'setRows([])',
    'setTotal(0)',
    'setOffset(0)',
    "setQuery('')",
    "setAppliedQuery('')",
    'setError(null)',
    'setLoaded(false)',
  ]) {
    assert.ok(reset.includes(cleared), `${cleared} must run on a club or account change`);
  }
});

test('a searched-empty ledger and an empty ledger still say different things', () => {
  const searched = renderLedger({ rows: [], loaded: true, appliedQuery: 'ace' });
  assert.match(searched, /No Purchases Match That Search/);
  const empty = renderLedger({ rows: [], loaded: true, appliedQuery: '' });
  assert.match(empty, /No Purchases Yet/);
});

// ───────────────────────────────────────────────────────────────────────────
// 8. A checkout that will not open is an error, not a silent nothing
// ───────────────────────────────────────────────────────────────────────────

test('every checkout on the store page treats a refusal to navigate as a failure', () => {
  const calls = page.match(/if \(!leaveForCheckout\(checkoutSession\.url\)\) \{/g) || [];
  assert.equal(calls.length, 3, 'diamonds, VIP and the Club Shop card each open a checkout');
  assert.equal(
    (page.match(/The Checkout Page Could Not Be Opened\. Please Try Again\./g) || []).length,
    3
  );
  // A bare, discarded call would leave the shopper with a toast, a re-enabled
  // button and no navigation, with the durable request still claimed.
  assert.doesNotMatch(page, /^\s*leaveForCheckout\(checkoutSession\.url\);/m);
});

test('the throw lands in the error path each handler already had', () => {
  for (const [label, marker] of [
    ['diamonds', "captureStoreEvent('checkout_failed', { route: 'diamonds'"],
    ['vip', "captureStoreEvent('checkout_failed', { route: 'vip'"],
    ['club card', "showStoreToast('error', error.message || 'Could Not Start Card Checkout.')"],
  ]) {
    assert.ok(page.includes(marker), `${label} must keep its existing error path`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 9. The address keeps describing the page
// ───────────────────────────────────────────────────────────────────────────

test('the sub-view is written back into the address, shallowly, by the control', () => {
  const { clubShopAddress } = storePage;
  assert.equal(clubShopAddress(CLUB_ID, 'manage'), `/hub/club-shop?clubId=${CLUB_ID}&view=manage`);
  assert.equal(clubShopAddress(CLUB_ID, 'store'), `/hub/club-shop?clubId=${CLUB_ID}`);
  assert.equal(clubShopAddress(null, 'my-purchases'), '/hub/club-shop?view=my-purchases');
  assert.equal(clubShopAddress(null, 'store'), '/hub/club-shop');

  const selector = page.slice(
    page.indexOf('const selectClubShopSubTab = useCallback('),
    page.indexOf('const clubShopDeleteGuards = useMemo(')
  );
  assert.match(selector, /setClubShopSubTab\(nextSubTab\)/);
  assert.match(selector, /clubShopAddress\(routeClubId, nextSubTab\)/);
  assert.match(selector, /shallow: true/);
  // Both sub-view controls go through it.
  assert.match(page, /selectClubShopSubTab\(st\.key\)/);
  assert.match(page, /selectClubShopSubTab\('store'\)/);
});

test('a Stripe return keeps the club AND the sub-view in the cleaned address', () => {
  const transport = page.slice(
    page.indexOf('const clearCheckoutTransport = () => {'),
    page.indexOf('const rawCanceled =')
  );
  assert.match(transport, /clubShopAddress\(routeClubId, clubShopSubTabRef\.current\)/);
  assert.match(transport, /as: cleanPath, url: cleanPath/);
});

test('an operator demoted mid-session is returned to the storefront', () => {
  const demotion = page.slice(
    page.indexOf('// ═══ Club Shop: an operator demoted mid-session ═══'),
    page.indexOf('// ═══ Club Shop: ?view= deep link ═══')
  );
  assert.ok(demotion.length > 0, 'the demotion guard is gone');
  // Only once the role is actually known: a refresh blip is not a demotion.
  assert.match(demotion, /if \(!clubShopSnapshotOwned \|\| clubShopIsAdmin\) return/);
  assert.match(demotion, /current === 'manage' \? 'store' : current/);
});

test('the club is read from the address only once the address has arrived', () => {
  assert.match(page, /const rawRouteClubId = router\.isReady/);
  const identity = page.slice(
    page.indexOf('// A private catalog, wallet, purchase history, and admin role are one'),
    page.indexOf('}, [committedStoreAccountId, routeClubId, router.isReady, setClubShopAdminAction]);')
  );
  assert.ok(identity.length > 0, 'the account identity effect no longer waits for the router');
  assert.match(identity, /if \(!router\.isReady\) return;/);
});

test('a refund refreshes the operator report instead of being dropped by its own guard', () => {
  const ledgerWiring = page.slice(
    page.indexOf('onLedgerChanged={() => {'),
    page.indexOf('{/* Create Item Form */}')
  );
  assert.match(ledgerWiring, /clubShopLoadingRef\.current = false/);
  assert.match(ledgerWiring, /clubShopAdminLoadingRef\.current = false/);
  assert.match(ledgerWiring, /loadClubShopAdmin\(\)/);
  // The guard that would otherwise drop it.
  assert.match(page, /clubShopAdminLoadingRef\.current \|\|/);
});

// ───────────────────────────────────────────────────────────────────────────
// 10. The operator panels leave the shopper's bundle alone
// ───────────────────────────────────────────────────────────────────────────

test('the three operator panels are code split, the way MerchStore already is', () => {
  for (const component of [
    'ClubShopItemEditor',
    'ClubShopPurchaseLedger',
    'ClubShopSalesAnalytics',
  ]) {
    assert.match(
      page,
      new RegExp(
        `const ${component} = dynamic\\(\\s*\\(\\) => import\\('\\.\\./\\.\\./src/components/store/${component}'\\)`
      ),
      `${component} must not be in every shopper's bundle`
    );
    assert.doesNotMatch(
      page,
      new RegExp(`^import ${component} from`, 'm'),
      `${component} must not also be imported statically`
    );
    // Still rendered from the same place, so an operator sees no change.
    assert.equal((page.match(new RegExp(`<${component}`, 'g')) || []).length, 1);
  }
  const manageBlock = page.slice(page.indexOf("clubShopSubTab === 'manage' && clubShopIsAdmin"));
  for (const component of [
    '<ClubShopSalesAnalytics',
    '<ClubShopPurchaseLedger',
    '<ClubShopItemEditor',
  ]) {
    assert.ok(manageBlock.includes(component), `${component} must render inside the Manage view`);
  }
});

test('the sales chart holds its peak instead of walking the series on every render', () => {
  assert.match(analyticsSource, /const peak = useMemo\(/);
  assert.match(analyticsSource, /\[series\]\s*\)/);
  // A report with no series must not produce a new array identity each render.
  assert.match(analyticsSource, /const EMPTY_SERIES = Object\.freeze\(\[\]\)/);
  assert.match(analyticsSource, /Array\.isArray\(data\?\.series\) \? data\.series : EMPTY_SERIES/);
});

// ───────────────────────────────────────────────────────────────────────────
// 11. The accessibility repairs
// ───────────────────────────────────────────────────────────────────────────

test('the toast stack is a live region that exists before there is anything to announce', () => {
  assert.doesNotMatch(toastSource, /if \(toasts\.length === 0\) return null;/);
  assert.match(toastSource, /className=\{styles\.stack\}\s*\n\s*role="status"/);
  assert.match(toastSource, /aria-live="polite"/);
  // Each toast still declares its own urgency inside it.
  assert.match(toastSource, /role=\{toast\.type === 'error' \? 'alert' : 'status'\}/);
});

test('the only mutating control in Manage without a busy state has one', () => {
  const create = page.slice(page.indexOf('{/* Create Item Form */}'), page.indexOf('{/* Admin Item List */}'));
  assert.match(create, /aria-busy=\{clubShopProcessing\}/);
  assert.match(create, /\{clubShopProcessing \? 'Creating\.\.\.' : 'Create Item'\}/);
});

test('the editor is a real form that takes focus and gives it back', () => {
  assert.match(editorSource, /<form\s*\n\s*ref=\{formRef\}\s*\n\s*onSubmit=\{submit\}/);
  assert.doesNotMatch(editorSource, /role="group"/);
  assert.match(editorSource, /type="submit"/);
  assert.match(editorSource, /formRef\.current\?\.querySelector\(/);
  // A static hint is not a live region: it re-announced on every render.
  assert.doesNotMatch(editorSource, /<div role="status" style=\{hintStyle\}>/);
  // The page hands focus back to the row's own control when the editor closes.
  assert.match(page, /ref=\{registerClubShopEditControl\(item\.id\)\}/);
  assert.match(page, /const control = clubShopEditControlsRef\.current\.get\(previous\)/);
  assert.match(page, /control\.focus\(\)/);
});

test('the rendered editor submits on Enter rather than swallowing it', () => {
  const html = renderEditor({
    item: timeBankItem(),
    clubId: CLUB_ID,
    maximumCardFundedPrice: CARD_LIMIT,
  });
  assert.match(html, /^<form/);
  assert.match(html, /<button type="submit"/);
});

test('the ledger disclosure states whether it is open, and is styled as a control', () => {
  const closed = renderToStaticMarkup(
    React.createElement(ledgerModule.default, { accountId: null, clubId: null })
  );
  assert.match(closed, /aria-expanded="false"/);
  const open = renderLedger({ rows: [ledgerRow()], total: 1, loaded: true });
  assert.match(open, /aria-expanded="true"/);
  // The status-pill class is the read-only badge's, not a button's.
  const header = ledgerSource.slice(
    ledgerSource.indexOf('Purchase Ledger\n        </h3>'),
    ledgerSource.indexOf('Search Purchases By Item Or Member')
  );
  assert.doesNotMatch(header, /clubAdminManagedStatus/);
  assert.match(header, /className=\{shellStyles\.clubAdminActions\}/);
});

test('the reason a refund is unavailable is text on the page, not a tooltip', () => {
  const html = renderLedger({
    rows: [ledgerRow({ status: 'redeemed', refundable: false })],
    total: 1,
    loaded: true,
  });
  assert.match(html, /Refund Unavailable/);
  assert.match(html, /Already Used\. The Granted Benefit Cannot Be Taken Back Automatically\./);
  assert.doesNotMatch(html, /title="Already Used/);
});

// ───────────────────────────────────────────────────────────────────────────
// 12. The house rules these surfaces are held to
// ───────────────────────────────────────────────────────────────────────────

test('nothing repaired here carries an em dash or an emoji', () => {
  for (const [label, source] of [
    ['the editor', editorSource],
    ['the ledger', ledgerSource],
    ['the sales report', analyticsSource],
    ['the toast', toastSource],
    ['the showcase', showcaseSource],
    ['the draft rules', read('src/lib/store/clubShopItemDraft.mjs')],
  ]) {
    assert.doesNotMatch(source, /[–—]/, `${label} must not use an em dash`);
    assert.doesNotMatch(
      source,
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u,
      `${label} must not use an emoji`
    );
  }
});

test('no club shop read this touched reaches for .single()', () => {
  for (const source of [page, ledgerSource, analyticsSource, editorSource]) {
    assert.doesNotMatch(source, /\.single\(\)/);
  }
});
