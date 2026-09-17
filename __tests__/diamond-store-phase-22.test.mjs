import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  formatWalletDescriptionParts,
  titleCaseWalletText,
} from '../src/lib/store/walletDescription.mjs';

const ROOT = new URL('../', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

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

  const files = await Promise.all(
    entries
      .filter((entry) => entry.name !== '__tests__')
      .map((entry) => collectRuntimeFiles(`${path}/${entry.name}`))
  );
  return files.flat().filter((file) => /\.(?:css|js|jsx|mjs)$/.test(file));
}

test('every Marketplace route and shared runtime source rejects banned long bars', async () => {
  const files = (await Promise.all(MARKETPLACE_ROUTE_ROOTS.map(collectRuntimeFiles))).flat();
  const failures = [];

  await Promise.all(
    files.map(async (file) => {
      const source = await read(file);
      if (/[\u2013\u2014]/u.test(source)) failures.push(file);
    })
  );

  assert.deepEqual(
    failures.sort(),
    [],
    `Banned em/en bars found in:\n${failures.sort().join('\n')}`
  );
});

test('Marketplace shells Title Case prose without recasing identities, URLs, or transaction data', async () => {
  const [
    detailCss,
    subpageCss,
    storefrontCss,
    fulfillmentCss,
    copy,
    detail,
    subpage,
    store,
    fulfillment,
  ] = await Promise.all([
    read('src/components/store/MarketplaceDetailExperience.module.css'),
    read('src/components/store/MarketplaceSubpageShell.module.css'),
    read('src/components/diamond-store/DiamondStoreShell.module.css'),
    read('pages/hub/merch-store/fulfillment.module.css'),
    read('src/lib/store/marketplaceCopy.js'),
    read('src/components/store/MarketplaceDetailExperience.jsx'),
    read('src/components/store/MarketplaceSubpageShell.jsx'),
    read('pages/hub/diamond-store.js'),
    read('pages/hub/merch-store/fulfillment.js'),
  ]);

  assert.doesNotMatch(detailCss, /text-transform\s*:/);
  assert.doesNotMatch(subpageCss, /text-transform\s*:/);
  assert.match(storefrontCss, /\.root\s*\{[\s\S]*?text-transform:\s*capitalize;/);
  assert.match(fulfillmentCss, /\.page\s*\{[^}]*text-transform:\s*capitalize;/);
  assert.match(
    storefrontCss,
    /\[data-preserve-case='true'\][\s\S]*?text-transform:\s*none !important;/
  );
  assert.match(
    fulfillmentCss,
    /\[data-preserve-case='true'\][\s\S]*?text-transform:\s*none !important;/
  );
  assert.match(copy, /export function marketplaceCopy/);
  assert.match(copy, /\\u2013.*\\u2014/u);
  assert.match(copy, /toUpperCase\(\)/);
  assert.match(detail, /data-title-case-strategy="normalized"/);
  assert.match(subpage, /data-title-case-strategy="normalized"/);
  assert.match(store, /data-title-case-strategy="css"/);
  assert.match(fulfillment, /data-title-case-strategy="css"/);
});

test('Marketplace copy normalization capitalizes words and removes both banned bar variants', async () => {
  const source = (await read('src/lib/store/marketplaceCopy.js'))
    .replace(/export function /g, 'function ')
    .concat(
      '\n({ marketplaceCarrierName, marketplaceCopy, marketplaceFulfillmentStatus, marketplaceToastCopy });'
    );
  const {
    marketplaceCarrierName,
    marketplaceCopy,
    marketplaceFulfillmentStatus,
    marketplaceToastCopy,
  } = vm.runInNewContext(source);

  assert.equal(
    marketplaceCopy('casino\u2014realism and club\u2013shop'),
    'Casino: Realism And Club: Shop'
  );
  assert.equal(marketplaceCopy('VIP access with Smarter.Poker'), 'VIP Access With Smarter.Poker');
  assert.equal(
    marketplaceCopy('PENDING_FULFILLMENT for VIP and GTO gear'),
    'Pending Fulfillment For VIP And GTO Gear'
  );
  assert.equal(
    marketplaceCopy('USPS and FedEx tracking for MTT prizes'),
    'USPS And FedEx Tracking For MTT Prizes'
  );
  assert.equal(
    marketplaceCopy('use WELCOME50 at https://smarter.poker/redeem?ref=mcPokerFan'),
    'Use WELCOME50 At https://smarter.poker/redeem?ref=mcPokerFan'
  );
  assert.equal(
    marketplaceCopy('receipt 3b2e74d0-cf27-4bc6-8e55-b04970090c40 for GPS at UTC'),
    'Receipt 3b2e74d0-cf27-4bc6-8e55-b04970090c40 For GPS At UTC'
  );
  assert.equal(
    marketplaceCopy('enable 2FA for @iPhoneKing with SKU_AbC and PvP POD access'),
    'Enable 2FA For @iPhoneKing With SKU_AbC And PvP POD Access'
  );
  assert.equal(
    marketplaceCopy('receipt 018f0f7e-7b1c-7abc-8def-0123456789ab'),
    'Receipt 018f0f7e-7b1c-7abc-8def-0123456789ab'
  );
  assert.equal(marketplaceCopy('ALL CAPS PRODUCT'), 'All Caps Product');
  assert.equal(
    marketplaceCopy('NLHE UI and UX alerts use SMS OTP for PKO GTD and OFC'),
    'NLHE UI And UX Alerts Use SMS OTP For PKO GTD And OFC'
  );
  assert.equal(marketplaceCopy('use SKU_BLUE with PROMO-ROYAL'), 'Use SKU_BLUE With PROMO-ROYAL');
  assert.equal(
    marketplaceFulfillmentStatus('printful_provider_state_persistence_failed'),
    'Printful Provider State Could Not Be Saved'
  );
  assert.equal(
    marketplaceFulfillmentStatus('printful_submission_state_unknown'),
    'Printful Submission Status Requires Review'
  );
  assert.equal(
    marketplaceFulfillmentStatus('awaiting_manual_fulfillment'),
    'Awaiting Manual Fulfillment'
  );
  assert.equal(marketplaceCarrierName('usps'), 'USPS');
  assert.equal(marketplaceCarrierName('UPS'), 'UPS');
  assert.equal(marketplaceCarrierName('fedex'), 'FedEx');
  assert.equal(marketplaceCarrierName('dhl'), 'DHL eCommerce');
  assert.equal(marketplaceCarrierName('dhl_ecommerce'), 'DHL eCommerce');
  assert.equal(marketplaceCarrierName('ACME_Xpress'), 'ACME_Xpress');
  assert.equal(
    marketplaceToastCopy('error', 'Stripe URL https://provider.example/secret failed'),
    'The Marketplace Request Could Not Be Completed. Please Try Again.'
  );
  assert.equal(marketplaceToastCopy('success', 'use WELCOME50 for 2FA'), 'Use WELCOME50 For 2FA');
});

test('dynamic Marketplace status and rarity labels use the shared Title Case normalizer', async () => {
  const [store, fulfillment, orders] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('pages/hub/merch-store/fulfillment.js'),
    read('pages/hub/diamond-store/orders.js'),
  ]);
  assert.doesNotMatch(store, /\{egg\.rarity\.toUpperCase\(\)\}/);
  assert.match(store, /\{marketplaceCopy\(egg\.rarity\)\}/);
  assert.doesNotMatch(fulfillment, /String\(order\.status \|\| 'paid'\)\.toUpperCase\(\)/);
  assert.match(
    fulfillment,
    /marketplaceFulfillmentStatus\(\s*metadata\.fulfillment_status \|\| order\.status \|\| 'paid'\s*\)/
  );
  assert.match(orders, /action_required:\s*\{[^}]*label:\s*'Action Required'/);
  assert.match(orders, /label:\s*marketplaceCopy\(normalizedStatus \|\| 'Unknown'\)/);
  assert.match(orders, /aria-label="Order Fulfillment"/);
  assert.doesNotMatch(orders, /aria-label=\{`Fulfillment For Order/);
  assert.match(fulfillment, /marketplaceCarrierName\(order\.carrier \|\| 'Carrier'\)/);
  assert.match(orders, /marketplaceFulfillmentStatus\(order\.fulfillmentStatus\)/);
  assert.match(orders, /marketplaceCarrierName\(order\.carrier\)/);
});

test('repository title-case enforcement covers Pages Router JavaScript without corrupting numeric suffixes', async () => {
  const gate = await read('scripts/ci/check-title-case.mjs');

  assert.match(gate, /const JSX_EXTS = new Set\(\['\.js', '\.jsx', '\.tsx'\]\)/);
  assert.match(
    gate,
    /const USER_VISIBLE_ATTRIBUTES = new Set\(\['placeholder', 'aria-label', 'alt', 'title'\]\)/
  );
  assert.match(gate, /const MARKETPLACE_ATTRIBUTE_PATH = \/\^\(\?:pages/);
  assert.match(gate, /ts\.isJsxAttribute\(node\)/);
  assert.match(gate, /ts\.isStringLiteral\(initializer\)/);
  assert.match(gate, /!isNonProseAttributeValue\(text\)/);
  assert.match(gate, /if \(\/\\d\/\.test\(before\)\) return word;/);
  assert.match(gate, /1\.5x, 7d, 24h, GPT-4o/);
});

test('Marketplace literal placeholders and accessible labels are Title Cased', async () => {
  const files = await Promise.all(
    [
      'pages/hub/diamond-store.js',
      'pages/hub/diamond-store/orders.js',
      'pages/hub/merch-store/fulfillment.js',
      'pages/hub/vip-membership/manage.js',
      'src/components/store/RewardTelemetryConsole.jsx',
      'src/components/store/DiamondWalletModal.jsx',
    ].map(read)
  );

  for (const source of files) {
    for (const gone of [
      'placeholder="Search items..."',
      'placeholder="Item name"',
      'placeholder="Description (optional)"',
      'placeholder="Image URL (optional)"',
      'placeholder="Order number, item, or status"',
      'aria-label="Merchandise fulfillment orders"',
      'aria-label="Close fulfillment operation"',
      'aria-label="VIP recurring plan controls"',
      'aria-label="Reward account signals"',
      'aria-label="Diamond transactions"',
    ]) {
      assert.ok(!source.includes(gone), `${gone} must remain Title Cased`);
    }
  }
});

test('title-case gate catches and safely fixes literal attributes without touching expressions or protocols', async (t) => {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'marketplace-title-case-'));
  const fixture = join(fixtureDir, 'fixture.jsx');
  t.after(() => rm(fixtureDir, { recursive: true, force: true }));
  await writeFile(
    fixture,
    `export default function Fixture() {
    return <><input placeholder="Search items..." aria-label="Reward account signals" />
      <input placeholder={'dynamic lowercase'} title="https://" /></>;
  }\n`
  );

  const check = spawnSync(
    process.execPath,
    ['scripts/ci/check-title-case.mjs', '--scan-file', fixture],
    { cwd: ROOT_PATH, encoding: 'utf8' }
  );
  assert.equal(check.status, 1);
  assert.match(check.stderr, /\[placeholder\]: Search items\.\.\./);
  assert.match(check.stderr, /\[aria-label\]: Reward account signals/);
  assert.doesNotMatch(check.stderr, /dynamic lowercase|Https:\/\//);

  const fix = spawnSync(
    process.execPath,
    ['scripts/ci/check-title-case.mjs', '--fix', '--scan-file', fixture],
    { cwd: ROOT_PATH, encoding: 'utf8' }
  );
  assert.equal(fix.status, 0, fix.stderr);
  const corrected = await readFile(fixture, 'utf8');
  assert.match(corrected, /placeholder="Search Items\.\.\."/);
  assert.match(corrected, /aria-label="Reward Account Signals"/);
  assert.match(corrected, /placeholder=\{'dynamic lowercase'\}/);
  assert.match(corrected, /title="https:\/\/"/);
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
  const boundaries = await Promise.all(
    [
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
      'src/components/store/StoreToast.jsx',
      'src/components/store/DiamondWalletModal.jsx',
      'src/components/diamond-store/CheckoutStatusPanel.jsx',
    ].map(read)
  );

  boundaries.forEach((source) => {
    assert.match(source, /marketplaceCopy/);
  });

  const [orders, receipt, fulfillment, checkout, checkoutCss, rewardCss, wallet] =
    await Promise.all([
      read('pages/hub/diamond-store/orders.js'),
      read('pages/hub/diamond-store/orders/[orderId].js'),
      read('pages/hub/merch-store/fulfillment.js'),
      read('src/components/diamond-store/CheckoutStatusPanel.jsx'),
      read('src/components/diamond-store/CheckoutStatusPanel.module.css'),
      read('src/components/store/RewardTelemetryConsole.module.css'),
      read('src/components/store/DiamondWalletModal.jsx'),
    ]);
  assert.match(orders, /marketplaceCopy\(order\.title\)/);
  assert.match(orders, /marketplaceCopy\(item\.name\)/);
  assert.match(orders, /data-preserve-case="true">\{order\.trackingNumber\}/);
  assert.match(
    receipt,
    /<MarketplaceConsoleStatusRow[\s\S]{0,120}?label=\{marketplaceCopy\(label\)\}/
  );
  assert.match(receipt, /data-preserve-case="true">\{record\.trackingNumber\}/);
  assert.match(fulfillment, /marketplaceCopy\(item\.name \|\| 'Marketplace Item'\)/);
  assert.match(fulfillment, /<code data-preserve-case="true">\{order\.id\}<\/code>/);
  assert.match(fulfillment, /<address data-user-content="true" data-preserve-case="true">/);
  assert.ok(
    (fulfillment.match(/<input\s+data-preserve-case="true"/g) || []).length >= 3,
    'tracking values and URLs must retain exact operator input casing'
  );
  assert.doesNotMatch(orders, /String\(order\.id[\s\S]{0,100}?\.toUpperCase\(\)/);
  assert.doesNotMatch(receipt, /String\(rawOrderId\)[\s\S]{0,100}?\.toUpperCase\(\)/);
  assert.doesNotMatch(checkout, /sessionId\.slice\(-12\)\.toUpperCase\(\)/);
  assert.match(
    checkout,
    /<dd data-preserve-case="true" data-user-content="true">\s*\{reference\}\s*<\/dd>/
  );
  assert.match(
    checkoutCss,
    /\.receipt \[data-preserve-case='true'\][^{]*\{[^}]*text-transform:\s*none;/s
  );
  assert.match(
    rewardCss,
    /\.signalGrid strong\[data-preserve-case='true'\][^{]*\{[^}]*text-transform:\s*none;/s
  );
  assert.match(wallet, /return \{ label: text \? marketplaceCopy\(text\) : 'Diamond Movement' \};/);
  assert.match(wallet, /<span className=\{styles\.txDetailValue\}>\{config\.label\}<\/span>/);
});

test('wallet and toast dynamic prose enforce the copy contract at their render boundaries', async () => {
  const [wallet, walletCss, toast] = await Promise.all([
    read('src/components/store/DiamondWalletModal.jsx'),
    read('src/components/store/DiamondWalletModal.module.css'),
    read('src/components/store/StoreToast.jsx'),
  ]);

  // The copy contract is applied at the dialog root, in the stylesheet since
  // 2026-09-13 (the wallet's inline styles were extracted to its module): the
  // dialog class capitalizes, and the same root carries preserveIdentityScope
  // so identities inside it opt back out.
  assert.match(walletCss, /\.dialog \{[^}]*text-transform:\s*capitalize;/);
  assert.match(
    wallet,
    /role="dialog"[\s\S]{0,400}?className=\{`\$\{styles\.preserveIdentityScope\} \$\{styles\.wallet\} \$\{styles\.dialog\}`\}/
  );
  assert.match(
    walletCss,
    /\.preserveIdentityScope \[data-preserve-case='true'\][\s\S]*?text-transform:\s*none !important;/
  );
  assert.match(wallet, /marketplaceCopy\(transferError\)/);
  assert.match(wallet, /marketplaceCopy\(error\)/);
  assert.ok(
    (wallet.match(/data-user-content="true"/g) || []).length >= 7,
    'every wallet identity surface must keep its authored capitalization'
  );
  assert.match(
    wallet,
    /data-user-content="true"[\s\S]*?data-preserve-case="true"[\s\S]*?>\s*@\{f\.username\}/,
    'the secondary friend handle must bypass title-case presentation'
  );
  assert.doesNotMatch(wallet, /marketplaceCopy\([^)]*(?:display_name|username)/);
  assert.match(toast, /const copyMessage = marketplaceToastCopy\(type, message\)/);
  assert.match(toast, /message:\s*copyMessage/);
  assert.match(toast, /normalizer preserves URLs, UUIDs, email addresses, and machine/);
});

test('wallet transfer descriptions Title Case system prose without recasing identities', () => {
  assert.deepEqual(
    formatWalletDescriptionParts(
      'Sent 10000 diamonds to mcPokerFan [3b2e74d0-cf27-4bc6-8e55-b04970090c40]'
    ),
    { copy: 'Sent 10,000 Diamonds To', identity: 'mcPokerFan' }
  );
  assert.deepEqual(
    formatWalletDescriptionParts(
      'Received 250 diamonds from iPhoneKing [96bd86ba-4518-42f5-8a32-bde6d98ff21b]'
    ),
    { copy: 'Received 250 Diamonds From', identity: 'iPhoneKing' }
  );
  assert.deepEqual(formatWalletDescriptionParts('vip reward for WSOP 2026'), {
    copy: 'VIP Reward For WSOP 2026',
    identity: null,
  });
  assert.equal(titleCaseWalletText('daily vip pass'), 'Daily VIP Pass');
  assert.equal(
    titleCaseWalletText('reward code WELCOME50 at 09:00 UTC'),
    'Reward Code WELCOME50 At 09:00 UTC'
  );
});

test('private VIP reads reject anonymous requests before database initialization', async () => {
  const source = await read('pages/api/store/vip-membership-status.js');
  const authBoundary = source.indexOf("if (!authHeader || !authHeader.startsWith('Bearer '))");
  const databaseBoundary = source.indexOf('getServerUserWithFallback(req, getSupabase())');

  assert.ok(authBoundary >= 0, 'VIP status must reject a missing bearer token');
  assert.ok(
    databaseBoundary > authBoundary,
    'anonymous rejection must happen before database initialization'
  );
});

test('Marketplace media inspection explicitly focuses the in-page close control', async () => {
  const source = await read('src/components/store/MarketplaceDetailExperience.jsx');

  assert.match(source, /requestAnimationFrame\(\(\) => closeMediaRef\.current\?\.focus\(\)\)/);
  assert.match(source, /cancelAnimationFrame\(focusFrame\)/);
});
