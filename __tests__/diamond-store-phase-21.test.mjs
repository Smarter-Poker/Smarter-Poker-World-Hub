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

test('operator report is server-owned, stable-paged, and never rewrites history from current prices', async () => {
  const [api, store] = await Promise.all([
    read('pages/api/club-arena/manage-shop.js'),
    read('pages/hub/diamond-store.js'),
  ]);

  assert.match(api, /select\('id, item_id, price_paid, currency, refunded_at, created_at'/);
  assert.match(api, /\.order\('created_at', \{ ascending: true \}\)/);
  assert.match(api, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(api, /\.range\(from, to\)/);
  assert.match(api, /complete: exhausted \|\| rows\.length >= totalRows/);
  assert.doesNotMatch(api, /purchase_count[^\n]*\*[^\n]*item\.price/);

  const loaderStart = store.indexOf('const loadClubShopAdmin = useCallback');
  const loaderEnd = store.indexOf('const handleClubShopAdminAction', loaderStart);
  const loader = store.slice(loaderStart, loaderEnd);
  assert.match(loader, /\/api\/club-arena\/manage-shop\?clubId=/);
  assert.doesNotMatch(loader, /\.from\('club_shop_purchases'\)/);
  assert.match(loader, /setClubShopAdminError/);
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
  assert.match(store, /await Promise\.all\(\[loadClubShopAdmin\(\), loadClubShop\(true\)\]\)/);
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
  assert.doesNotMatch(analytics, /const MAX_ROWS = 10000/);
  assert.doesNotMatch(analytics, /catch \([^)]*\) \{ \/\* sentry optional \*\/ \}/);
});
