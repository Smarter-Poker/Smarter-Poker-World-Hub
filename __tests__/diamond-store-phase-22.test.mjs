import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

const MARKETPLACE_ROUTE_ROOTS = [
  'pages/hub/diamond-store.js',
  'pages/hub/diamond-store',
  'pages/hub/merch-store.js',
  'pages/hub/merch-store',
  'pages/hub/vip-membership.js',
  'pages/hub/vip-membership',
  'pages/hub/smarter-rewards.js',
  'pages/hub/smarter-rewards',
  'pages/hub/club-shop.js',
  'pages/hub/club-shop',
  'src/components/store',
  'src/components/diamond-store',
  'src/data/diamondStoreData.js',
  'scripts/verify-marketplace-deployment.mjs',
];

async function collectRuntimeFiles(path) {
  const url = new URL(path, ROOT);
  const entries = await readdir(url, { withFileTypes: true }).catch(() => null);
  if (!entries) return [path];

  const files = await Promise.all(entries
    .filter(entry => entry.name !== '__tests__')
    .map(entry => collectRuntimeFiles(`${path}/${entry.name}`)));
  return files.flat().filter(file => /\.(?:css|js|jsx|mjs)$/.test(file));
}

test('every Marketplace route and shared runtime source rejects banned long bars', async () => {
  const files = (await Promise.all(MARKETPLACE_ROUTE_ROOTS.map(collectRuntimeFiles))).flat();
  const failures = [];

  await Promise.all(files.map(async file => {
    const source = await read(file);
    if (/[\u2013\u2014]/u.test(source)) failures.push(file);
  }));

  assert.deepEqual(failures.sort(), [], `Banned em/en bars found in:\n${failures.sort().join('\n')}`);
});

test('Marketplace shells enforce first-letter capitalization for static and dynamic inventory copy', async () => {
  const [detailCss, subpageCss, storefrontCss, fulfillmentCss, copy] = await Promise.all([
    read('src/components/store/MarketplaceDetailExperience.module.css'),
    read('src/components/store/MarketplaceSubpageShell.module.css'),
    read('src/components/diamond-store/DiamondStoreShell.module.css'),
    read('pages/hub/merch-store/fulfillment.module.css'),
    read('src/lib/store/marketplaceCopy.js'),
  ]);

  assert.match(detailCss, /\.page\s*\{[\s\S]*?text-transform:\s*capitalize;/);
  assert.match(subpageCss, /\.stage\s*\{[\s\S]*?text-transform:\s*capitalize;/);
  assert.match(storefrontCss, /\.root\s*\{[\s\S]*?text-transform:\s*capitalize;/);
  assert.match(fulfillmentCss, /\.page\s*\{[^}]*text-transform:\s*capitalize;/);
  assert.match(copy, /export function marketplaceCopy/);
  assert.match(copy, /\\u2013.*\\u2014/u);
  assert.match(copy, /toUpperCase\(\)/);
});

test('Marketplace copy normalization capitalizes words and removes both banned bar variants', async () => {
  const source = (await read('src/lib/store/marketplaceCopy.js'))
    .replace(/export function /g, 'function ')
    .concat('\nmarketplaceCopy;');
  const marketplaceCopy = vm.runInNewContext(source);

  assert.equal(
    marketplaceCopy('casino\u2014realism and club\u2013shop'),
    'Casino: Realism And Club: Shop'
  );
  assert.equal(
    marketplaceCopy('VIP access with Smarter.Poker'),
    'VIP Access With Smarter.Poker'
  );
});

test('repository title-case enforcement covers Pages Router JavaScript without corrupting numeric suffixes', async () => {
  const gate = await read('scripts/ci/check-title-case.mjs');

  assert.match(gate, /const JSX_EXTS = new Set\(\['\.js', '\.jsx', '\.tsx'\]\)/);
  assert.match(gate, /if \(\/\\d\/\.test\(before\)\) return word;/);
  assert.match(gate, /1\.5x, 7d, 24h, GPT-4o/);
});

test('accessible Marketplace shell copy is normalized before rendering or entering metadata', async () => {
  const [detail, subpage] = await Promise.all([
    read('src/components/store/MarketplaceDetailExperience.jsx'),
    read('src/components/store/MarketplaceSubpageShell.jsx'),
  ]);

  assert.match(detail, /const copyTitle = marketplaceCopy\(title\)/);
  assert.match(detail, /<title>\{`\$\{copyTitle\}: Smarter\.Poker Marketplace`\}<\/title>/);
  assert.match(detail, /aria-label=\{`Inspect \$\{copyTitle\} Image Full Screen`\}/);
  assert.match(detail, /serializeStructuredData\(marketplaceStructuredData\(structuredData\)\)/);
  assert.match(subpage, /const copyDescription = marketplaceCopy\(description\)/);
  assert.match(subpage, /<p>\{copyDescription\}<\/p>/);
});

test('remote Marketplace inventory and account telemetry cannot reintroduce banned copy', async () => {
  const boundaries = await Promise.all([
    'pages/hub/diamond-store.js',
    'pages/hub/club-shop/[itemId].js',
    'pages/hub/diamond-store/cart.js',
    'pages/hub/diamond-store/orders.js',
    'pages/hub/diamond-store/orders/[orderId].js',
    'pages/hub/diamond-store/wishlist.js',
    'pages/hub/merch-store/fulfillment.js',
    'pages/hub/vip-membership/manage.js',
    'src/components/store/MerchStore.jsx',
    'src/components/store/RewardTelemetryConsole.jsx',
    'src/components/store/ShoppingCart.jsx',
    'src/components/store/StoreCards.js',
    'src/components/diamond-store/CheckoutStatusPanel.jsx',
  ].map(read));

  boundaries.forEach(source => {
    assert.match(source, /marketplaceCopy/);
  });
});

test('private VIP reads reject anonymous requests before database initialization', async () => {
  const source = await read('pages/api/store/vip-membership-status.js');
  const authBoundary = source.indexOf("if (!authHeader || !authHeader.startsWith('Bearer '))");
  const databaseBoundary = source.indexOf('getServerUserWithFallback(req, getSupabase())');

  assert.ok(authBoundary >= 0, 'VIP status must reject a missing bearer token');
  assert.ok(databaseBoundary > authBoundary, 'anonymous rejection must happen before database initialization');
});

test('Marketplace media inspection explicitly focuses the in-page close control', async () => {
  const source = await read('src/components/store/MarketplaceDetailExperience.jsx');

  assert.match(source, /requestAnimationFrame\(\(\) => closeMediaRef\.current\?\.focus\(\)\)/);
  assert.match(source, /cancelAnimationFrame\(focusFrame\)/);
});
