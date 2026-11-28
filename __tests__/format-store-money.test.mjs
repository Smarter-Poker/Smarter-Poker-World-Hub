// The shared store USD formatter: whole dollars without decimals, fractional
// amounts exact to the cent, thousands separators, never "And X Cents".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { formatUsd, formatUsdCents } from '../src/lib/store/formatStoreMoney.mjs';
import { formatStoreUsd } from '../src/lib/store/wholeDollarPrice.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

test('formatUsd shows whole amounts with no decimals', () => {
  assert.equal(formatUsd(0), '$0');
  assert.equal(formatUsd(5), '$5');
  assert.equal(formatUsd(20), '$20');
  assert.equal(formatUsd(500), '$500');
  assert.equal(formatUsd(1250), '$1,250');
  assert.equal(formatUsd(1234567), '$1,234,567');
  assert.equal(formatUsd('20'), '$20');
  assert.equal(formatUsd(20.0), '$20');
});

test('formatUsd keeps fractional amounts exact to two decimals', () => {
  assert.equal(formatUsd(4.99), '$4.99');
  assert.equal(formatUsd(0.5), '$0.50');
  assert.equal(formatUsd(0.05), '$0.05');
  assert.equal(formatUsd(1234.5), '$1,234.50');
  assert.equal(formatUsd(19.999), '$20');
  assert.equal(formatUsd(0.1 + 0.2), '$0.30');
  assert.equal(formatUsd(1499 / 100), '$14.99');
});

test('formatUsd never spells out cents and handles signs and junk', () => {
  for (const value of [4.99, 0.01, 1234.56, 99.9]) assert.doesNotMatch(formatUsd(value), /And|Cents/);
  assert.equal(formatUsd(-5), '-$5');
  assert.equal(formatUsd(-4.5), '-$4.50');
  for (const junk of [undefined, null, NaN, Infinity, 'abc', '']) assert.equal(formatUsd(junk), '$0');
});

test('formatUsdCents reads integer cents', () => {
  assert.equal(formatUsdCents(2000), '$20');
  assert.equal(formatUsdCents(499), '$4.99');
  assert.equal(formatUsdCents(123450), '$1,234.50');
  assert.equal(formatUsdCents(5), '$0.05');
  assert.equal(formatUsdCents(-1500), '-$15');
  assert.equal(formatUsdCents(null), '$0');
});

test('formatStoreUsd keeps its existing offer-copy behaviour', () => {
  assert.equal(formatStoreUsd(20), '20');
  assert.equal(formatStoreUsd(1250), '1,250');
  assert.equal(formatStoreUsd(4.99), '4 And 99 Cents');
});

test('store displays use the shared formatter instead of toFixed(2) USD', () => {
  const users = [
    'pages/hub/diamond-store/cart.js',
    'pages/hub/diamond-store/orders.js',
    'pages/hub/diamond-store/orders/[orderId].js',
    'pages/hub/diamond-store/wishlist.js',
    'pages/hub/club-shop/[itemId].js',
    'pages/hub/merch-store/fulfillment.js',
    'src/components/diamond-store/CheckoutStatusPanel.jsx',
  ];
  for (const file of users) {
    const source = read(file);
    assert.match(source, /from '[./]+src\/lib\/store\/formatStoreMoney\.mjs'|from '[./]+lib\/store\/formatStoreMoney\.mjs'/, file);
    assert.doesNotMatch(source, /\$\{?[^`\n]*\.toFixed\(2\)/, `${file} must not format USD with toFixed(2)`);
  }
  assert.doesNotMatch(read('pages/hub/diamond-store/cart.js'), /function formatCartUsd/);
  assert.doesNotMatch(read('src/components/diamond-store/CheckoutStatusPanel.jsx'), /style: 'currency'/);
});

test('the operator fulfillment console reads money and counts like the rest of the store', () => {
  const source = read('pages/hub/merch-store/fulfillment.js');
  assert.match(source, /import \{ formatUsd \} from '\.\.\/\.\.\/\.\.\/src\/lib\/store\/formatStoreMoney\.mjs'/);
  assert.match(source, /: formatUsd\(order\.total_usd\)\}/);
  // Every operations metric is a grouped count (18,000), never a bare number.
  for (const metric of ['orders?.created', 'orders?.awaitingAttention', 'orders?.providerReview', 'lifetimeVip?.monthlyDiamondsIssued', 'funnel?.store_checkout_complete']) {
    assert.ok(source.includes(`formatCount(operationsSummary.summary?.${metric})`), `${metric} must use formatCount`);
  }
});
