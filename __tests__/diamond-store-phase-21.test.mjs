import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');
const require = createRequire(import.meta.url);
const {
  summarizeShopPurchases,
  totalsForCurrency,
  normalizePaidAmount,
  buildLedgerCompleteness,
} = require('../src/lib/club-arena/shopReporting.js');

test('Club Shop reporting separates currencies and subtracts refunds from historical paid values', () => {
  const summary = summarizeShopPurchases([
    { item_id: 'one', price_paid: 1200, currency: 'diamonds', refunded_at: null },
    { item_id: 'one', price_paid: 900, currency: 'diamonds', refunded_at: '2026-08-30' },
    { item_id: 'one', price_paid: 75, currency: 'chips', refunded_at: null },
    { item_id: 'two', price_paid: 25, currency: null, refunded_at: null },
    { item_id: 'two', price_paid: 5, currency: 'future_token', refunded_at: null },
  ]);

  assert.deepEqual(totalsForCurrency(summary, 'diamonds'), {
    sales: 2,
    refundedSales: 1,
    netSales: 1,
    gross: 2100,
    refunded: 900,
    net: 1200,
  });
  assert.equal(summary.byCurrency.chips.net, 100);
  assert.equal(summary.byCurrency.future_token.net, 5);
  assert.equal(summary.byItem.one.byCurrency.diamonds.net, 1200);
});

test('reporting rejects corrupt ledger amounts instead of inventing zero revenue', () => {
  assert.equal(normalizePaidAmount(0), 0);
  assert.equal(normalizePaidAmount('1200'), 1200);
  assert.throws(() => normalizePaidAmount('not-a-price'), /non-negative safe integer/);
  assert.throws(() => normalizePaidAmount(-1), /non-negative safe integer/);
  assert.throws(
    () => summarizeShopPurchases([{ item_id: 'one', price_paid: null, currency: 'diamonds' }]),
    /non-negative safe integer/
  );
});

test('bounded ledgers never claim completeness when an exact count is unavailable at the cap', () => {
  assert.deepEqual(
    buildLedgerCompleteness({ processedRows: 50000, exactCount: null, exhausted: false }),
    { totalRows: 50000, totalRowsExact: false, complete: false }
  );
  assert.deepEqual(
    buildLedgerCompleteness({ processedRows: 7, exactCount: null, exhausted: true }),
    { totalRows: 7, totalRowsExact: true, complete: true }
  );
  assert.deepEqual(
    buildLedgerCompleteness({ processedRows: 1000, exactCount: 1000, exhausted: false }),
    { totalRows: 1000, totalRowsExact: true, complete: true }
  );
});

test('operator report is server-owned, stable-paged, and never rewrites history from current prices', async () => {
  const [api, store, e2e] = await Promise.all([
    read('pages/api/club-arena/manage-shop.js'),
    read('pages/hub/diamond-store.js'),
    read('e2e/05-diamond-store.spec.ts'),
  ]);

  assert.match(api, /select\('id, item_id, price_paid, currency, refunded_at, created_at'/);
  assert.match(api, /\.order\('created_at', \{ ascending: true \}\)/);
  assert.match(api, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(api, /\.range\(from, to\)/);
  assert.match(api, /buildLedgerCompleteness/);
  assert.match(api, /\.lte\('created_at', snapshotAt\)/);
  assert.match(api, /totalRowsExact: ledger\.totalRowsExact/);
  assert.match(api, /Cache-Control', 'private, no-store, max-age=0'/);
  assert.match(api, /if \(!isUUID\(clubId\)\)/);
  assert.doesNotMatch(api, /purchase_count[^\n]*\*[^\n]*item\.price/);

  const loaderStart = store.indexOf('const loadClubShopAdmin = useCallback');
  const loaderEnd = store.indexOf('const handleClubShopAdminAction', loaderStart);
  const loader = store.slice(loaderStart, loaderEnd);
  assert.match(loader, /\/api\/club-arena\/manage-shop\?clubId=/);
  assert.doesNotMatch(loader, /\.from\('club_shop_purchases'\)/);
  assert.match(loader, /setClubShopAdminError/);
  assert.match(loader, /getFreshAccessToken/);
  assert.match(loader, /new AbortController\(\)/);
  assert.match(loader, /setClubShopAdminReport\(null\)/);
  assert.match(e2e, /page\.route\('\*\*\/api\/club-arena\/manage-shop\?\*'/);
  assert.doesNotMatch(e2e, /rest\/v1\/club_shop_purchases/);
});

test('operator UI labels platform Diamond burns, legacy chips, partial data, and retry recovery honestly', async () => {
  const store = await read('pages/hub/diamond-store.js');
  assert.match(store, /Diamonds Burned/);
  assert.match(store, /100% Platform-Owned Diamond Burns/);
  assert.match(store, /No Club,[\s\S]*Owner,[\s\S]*Agent,[\s\S]*Commission Ledger Is Credited/);
  assert.match(store, /Legacy History:/);
  assert.match(store, /Report Is Partial:/);
  assert.match(store, /Retry Report/);
  assert.match(store, /role="alert"/);
  assert.match(store, /clubShopAdminReport\s*&&\s*!clubShopAdminError/);
  assert.match(store, /At Least/);
  assert.match(store, /await Promise\.all\(\[loadClubShopAdmin\(\), loadClubShop\(true\)\]\)/);
  assert.match(
    store,
    /table: 'club_shop_purchases',[\s\S]{0,500}if \(clubShopAdminLoaded\) loadClubShopAdmin\(\)/
  );
});

test('shopper storefront resolves membership server-side and cannot remain stuck on a stale request', async () => {
  const [store, api] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('pages/api/club-arena/marketplace-items.js'),
  ]);
  const loaderStart = store.indexOf('const loadClubShop = useCallback');
  const loaderEnd = store.indexOf('// ═══ Club Shop: Purchase handler', loaderStart);
  const loader = store.slice(loaderStart, loaderEnd);

  assert.match(store, /const clubShopLoadRequestRef = useRef\(0\)/);
  assert.match(store, /const clubShopLoadTimerRef = useRef\(null\)/);
  assert.match(loader, /const requestId = \+\+clubShopLoadRequestRef\.current/);
  assert.doesNotMatch(loader, /\.from\('club_members'\)/);
  assert.match(loader, /const loadController = new AbortController\(\)/);
  assert.match(loader, /loadController\.abort\(\)/);
  assert.match(loader, /signal: loadController\.signal/);
  assert.match(loader, /const targetClub = data\.clubId \|\| null/);
  assert.match(loader, /requestId !== clubShopLoadRequestRef\.current/);
  assert.match(loader, /setClubShopError\(null\)/);
  assert.match(loader, /const loadTimer = setTimeout/);
  assert.match(store, /const CLUB_SHOP_LOAD_TIMEOUT_MS = 12000/);
  assert.match(loader, /}, CLUB_SHOP_LOAD_TIMEOUT_MS\)/);
  assert.match(loader, /clubShopLoadRequestRef\.current \+= 1/);
  assert.match(loader, /setClubShopLoaded\(true\)/);
  assert.match(loader, /setClubShopError\('The Club Shop Timed Out\. Please Try Again\.'\)/);
  assert.match(loader, /clearTimeout\(loadTimer\)/);
  assert.match(store, /clearTimeout\(clubShopLoadTimerRef\.current\)/);

  // 2026-09-05: with no clubId the route no longer takes the first
  // club_members row PostgREST returns (an unordered .limit(1) that landed
  // Dan on a club with no stock); it prefers the membership with the most
  // active club_shop_items and falls back to any membership.
  assert.match(api, /defaults to the member's club with the most active stock/);
  assert.match(api, /\.select\('club_id, role'\)/);
  assert.match(api, /\.eq\('club_id', requestedClubId\)/);
  assert.match(api, /\.from\('club_shop_items'\)[\s\S]{0,200}\.eq\('is_active', true\)/);
  assert.doesNotMatch(api, /membershipQuery/);
  assert.match(api, /if \(membershipError\) throw membershipError/);
  assert.match(api, /clubId: null/);
  assert.match(api, /clubId,/);
});

test('Club Shop detail resolves server-owned membership and terminates stalled inventory loads', async () => {
  const detail = await read('pages/hub/club-shop/[itemId].js');
  const loaderStart = detail.indexOf('const loadItem = useCallback');
  const loaderEnd = detail.indexOf('useEffect(() => {', loaderStart);
  const loader = detail.slice(loaderStart, loaderEnd);

  assert.doesNotMatch(detail, /ensureAuthReady/);
  assert.doesNotMatch(detail, /src\/lib\/supabase/);
  assert.doesNotMatch(loader, /\.from\('club_members'\)/);
  assert.match(detail, /const CLUB_DETAIL_LOAD_TIMEOUT_MS = 20000/);
  assert.match(loader, /params\.set\('itemId', itemId\)/);
  assert.match(loader, /const loadController = new AbortController\(\)/);
  assert.match(loader, /signal: loadController\.signal/);
  assert.match(loader, /Club inventory timed out\. Retry the verified inventory request\./);
  assert.match(loader, /const targetClub = body\.clubId \|\| null/);
  assert.match(loader, /window\.clearTimeout\(loadTimer\)/);
  assert.match(detail, /loadAbortRef\.current\?\.abort\(\)/);
});

test('Club Shop detail API scopes and parallelizes cold authenticated item reads', async () => {
  const api = await read('pages/api/club-arena/marketplace-items.js');

  assert.match(api, /if \(requestedItemId && !isUUID\(requestedItemId\)\)/);
  assert.match(api, /itemsPromise = itemsPromise\.eq\('id', requestedItemId\)\.limit\(1\)/);
  assert.match(api, /if \(requestedItemId\) \{[\s\S]*?Promise\.all\(\[/);
  assert.match(api, /\.eq\('item_id', requestedItemId\)/);
  assert.match(api, /if \(!requestedItemId\) \{/);
  assert.match(api, /if \(requestedItemId\) fallbackQuery = fallbackQuery\.eq\('item_id', requestedItemId\)/);
});

test('direct Vercel uploads retain the complete migration evidence tree', async () => {
  const ignore = await read('.vercelignore');

  assert.doesNotMatch(ignore, /^\/supabase\/\*$/m);
  assert.doesNotMatch(ignore, /^\/supabase\/migrations\/\*$/m);
  assert.match(ignore, /!\/supabase\/migrations\/20260829130000_club_shop_atomic_purchase\.sql/);
});

test('Club Shop browser fixtures follow the server-owned membership response', async () => {
  const e2e = await read('e2e/05-diamond-store.spec.ts');
  const detailFixture = e2e.slice(
    e2e.indexOf("test('club item detail reviews one diamond settlement"),
    e2e.indexOf("test('marketplace readiness is public", e2e.indexOf("test('club item detail reviews one diamond settlement"))
  );
  const adminFixture = e2e.slice(
    e2e.indexOf("test('Club Shop operators delete"),
    e2e.lastIndexOf('\n});')
  );

  assert.match(detailFixture, /clubId,/);
  assert.match(adminFixture, /marketplace-items\*'/);
  assert.match(adminFixture, /clubId,/);
  assert.doesNotMatch(adminFixture, /rest\/v1\/club_members/);
});

test('public merchandise catalog retries cold reads without serial variant latency', async () => {
  const [catalog, readiness] = await Promise.all([
    read('pages/api/store/merch-catalog.js'),
    read('src/lib/store/marketplaceReadiness.js'),
  ]);

  assert.match(catalog, /withTransientRetry/);
  assert.match(catalog, /const MAX_VARIANTS = 1_000/);
  assert.match(catalog, /const \[itemResult, variantResult\] = await Promise\.all/);
  assert.match(catalog, /\.limit\(MAX_VARIANTS \+ \(strict \? 1 : 0\)\)/);
  assert.doesNotMatch(catalog, /\.in\('item_id'/);
  assert.match(readiness, /const DEFAULT_MAX_ATTEMPTS = 2/);
});

test('analytics reports Diamond totals separately and exposes bounded completeness', async () => {
  const analytics = await read('pages/api/club-arena/shop-analytics.js');
  assert.match(analytics, /price_paid, currency/);
  assert.match(analytics, /revenueByCurrency/);
  assert.match(analytics, /refundedByCurrency/);
  assert.match(analytics, /primaryCurrency: PRIMARY_SHOP_CURRENCY/);
  assert.match(analytics, /completeness:/);
  assert.match(analytics, /processedRows:/);
  assert.match(analytics, /totalRows:/);
  assert.match(analytics, /totalRowsExact:/);
  assert.match(analytics, /snapshotAt/);
  assert.match(analytics, /for \(let i = 0; i < days; i\+\+\)/);
  assert.match(analytics, /salesByCurrency/);
  assert.match(analytics, /refundedSalesByCurrency/);
  assert.match(analytics, /sales: diamondTotals\.netSales/);
  assert.doesNotMatch(analytics, /const MAX_ROWS = 10000/);
  assert.doesNotMatch(analytics, /catch \([^)]*\) \{ \/\* sentry optional \*\/ \}/);
});
