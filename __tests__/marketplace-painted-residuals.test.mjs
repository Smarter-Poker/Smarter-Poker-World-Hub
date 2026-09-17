import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const files = {
  checkout: 'src/components/diamond-store/CheckoutStatusPanel.module.css',
  toast: 'src/components/store/StoreToast.module.css',
  toastComponent: 'src/components/store/StoreToast.jsx',
  merch: 'src/components/store/MerchStore.module.css',
  dialog: 'src/components/store/MerchPurchaseDialog.module.css',
  dialogComponent: 'src/components/store/MerchPurchaseDialog.jsx',
  telemetry: 'src/components/store/RewardTelemetryConsole.module.css',
  vip: 'src/components/store/VipMembershipConsole.module.css',
  fulfillment: 'pages/hub/merch-store/fulfillment.module.css',
  shell: 'src/components/diamond-store/DiamondStoreShell.module.css',
  showcase: 'src/components/diamond-store/SmarterStoreShowcase.module.css',
  legacyStyles: 'src/components/diamond-store/diamondStoreStyles.js',
  storeCards: 'src/components/store/StoreCards.module.css',
};

const paintedMarketplaceScope = [
  'src/components/diamond-store/DiamondStoreShell.module.css',
  'src/components/store/DiamondWalletModal.module.css',
  'src/components/store/StoreCards.module.css',
  'src/components/store/MerchPurchaseDialog.module.css',
  'src/components/diamond-store/SmarterStoreShowcase.module.css',
  'pages/hub/diamond-store.js',
  'src/components/store/ShoppingCart.jsx',
  'src/components/store/StoreCards.js',
  'src/components/diamond-store/diamondStoreStyles.js',
];

test('transaction notices use the native-ratio painted status family', () => {
  const checkout = read(files.checkout);
  const toast = read(files.toast);
  const toastComponent = read(files.toastComponent);

  for (const source of [checkout, toast]) {
    assert.match(source, /status\/wallet-row-shell\.webp/);
    assert.match(source, /aspect-ratio:\s*1800\s*\/\s*386/);
  }
  assert.match(checkout, /utility\/utility-shell\.webp/);
  assert.match(toast, /\.dismiss\s*\{[\s\S]*?shark-panel\/button-secondary\.png/);
  assert.doesNotMatch(toastComponent, /TOAST_STYLES|--toast-bg|linear-gradient/);
});

test('merchandise confirmation uses one coherent sliced spade console', () => {
  const component = read(files.dialogComponent);
  const styles = read(files.dialog);

  assert.doesNotMatch(component, /styles\.(?:rail|seal)/);
  assert.match(styles, /\.header\s*\{[\s\S]*?spade-console\/top\.webp/);
  assert.match(styles, /\.panelBody\s*\{[\s\S]*?spade-console\/mid\.png/);
  assert.match(styles, /background-repeat:\s*repeat-y/);
  assert.match(styles, /\.actions\s*\{[\s\S]*?spade-console\/bottom-plates\.webp/);
});

test('reward and VIP live data use painted rows without duplicate outer consoles', () => {
  const telemetry = read(files.telemetry);
  const vip = read(files.vip);

  assert.match(telemetry, /\.circuit\s*\{[\s\S]*?status\/wallet-row-shell\.webp/);
  assert.match(telemetry, /\.statePanel\s*\{[\s\S]*?utility\/utility-shell\.webp/);
  assert.match(telemetry, /\.console\s*\{[\s\S]*?background:\s*#000/);
  assert.doesNotMatch(
    telemetry.match(/\.console\s*\{[\s\S]*?\n\}/)?.[0] || '',
    /linear-gradient|radial-gradient|box-shadow/
  );

  assert.match(vip, /\.statusLine div\s*\{[\s\S]*?status\/wallet-row-shell\.webp/);
  assert.match(vip, /\.plan\s*\{[\s\S]*?utility\/utility-shell\.webp/);
  assert.match(vip, /\.dialog\s*\{[\s\S]*?utility\/utility-shell\.webp/);
  assert.match(vip, /\.panel\s*\{[\s\S]*?background:\s*transparent/);
});

test('VIP benefit and FAQ rows use native-ratio painted hardware instead of generic cards', () => {
  const shell = read('src/components/diamond-store/DiamondStoreShell.module.css');
  const legacyStyles = read('src/components/diamond-store/diamondStoreStyles.js');
  const store = read('pages/hub/diamond-store.js');

  const benefit = shell.match(/\.premiumDataCard\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const benefitRail = shell.match(/\.premiumDataFrameMid\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const faqRow = shell.match(/\.vipFaq details\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const faqQuestion = shell.match(/\.vipFaq summary\s*\{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(benefit, /background:\s*transparent/);
  assert.doesNotMatch(benefit, /(?:linear|radial|conic)-gradient|border-radius|box-shadow/);
  assert.match(
    shell,
    /\.premiumDataFrameTop\s*\{[\s\S]*?aspect-ratio:\s*900\s*\/\s*143[\s\S]*?shark-panel\/top\.png/
  );
  assert.match(benefitRail, /shark-panel\/mid\.png/);
  assert.match(benefitRail, /100% auto repeat-y/);
  assert.match(
    shell,
    /\.premiumDataFrameBottom\s*\{[\s\S]*?aspect-ratio:\s*900\s*\/\s*139[\s\S]*?shark-panel\/bottom\.png/
  );
  assert.match(store, /premiumDataFrameTop[\s\S]*premiumDataFrameMid[\s\S]*premiumDataFrameBottom/);
  assert.match(shell, /\.vipBenefits \.responsiveGrid\s*\{[\s\S]*?repeat\(2,/);

  assert.match(faqRow, /status\/wallet-row-shell\.webp/);
  assert.match(faqRow, /aspect-ratio:\s*1800\s*\/\s*386/);
  assert.doesNotMatch(faqRow, /(?:linear|radial|conic)-gradient|border-left|box-shadow/);
  assert.doesNotMatch(faqQuestion, /(?:linear|radial|conic)-gradient|border-left|box-shadow/);

  assert.doesNotMatch(
    legacyStyles.match(/benefitCard:\s*\{[\s\S]*?\n\s*\},/)?.[0] || '',
    /background:|border:|borderRadius:/
  );
  assert.doesNotMatch(store, /className=\{shellStyles\.vipFaq\}\s+style=/);
});

test('merch and fulfillment keep variable-height cards honest while upgrading compatible states', () => {
  const merch = read(files.merch);
  const fulfillment = read(files.fulfillment);

  assert.match(merch, /\.balanceReadout\s*\{[\s\S]*?status\/wallet-row-shell\.webp/);
  assert.match(merch, /\.catalogAlert\s*\{[\s\S]*?status\/wallet-row-shell\.webp/);
  assert.match(merch, /\.emptyState\s*\{[\s\S]*?utility\/utility-shell\.webp/);
  assert.doesNotMatch(
    merch.match(/\.productCard\s*\{[\s\S]*?\n\}/)?.[0] || '',
    /navigation\/nav-shell|shark-panel\/bay|utility\/utility-shell/
  );

  assert.match(fulfillment, /\.status\s*\{[\s\S]*?status\/wallet-row-shell\.webp/);
  assert.match(fulfillment, /\.dialog\s*\{[\s\S]*?utility\/utility-shell\.webp/);
  assert.doesNotMatch(
    fulfillment.match(/\.order\s*\{[\s\S]*?\n\}/)?.[0] || '',
    /navigation\/nav-shell|shark-panel\/bay|utility\/utility-shell/
  );
});

test('upgraded Marketplace surfaces reject CSS-painted gradients and decorative edge bars', () => {
  const fulfillment = read(files.fulfillment);
  const merch = read(files.merch);
  const shell = read(files.shell);
  const showcase = read(files.showcase);
  const legacyStyles = read(files.legacyStyles);
  const storeCards = read(files.storeCards);
  const telemetry = read(files.telemetry);
  const heroOverlays = [...showcase.matchAll(/\.hero:after\s*\{[\s\S]*?\n\s*\}/g)];

  assert.ok(heroOverlays.length > 1, 'expected the mobile hero overlay rule');

  const flatRules = [
    ['fulfillment order', fulfillment.match(/\.order\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['VIP status', shell.match(/\.vipStatusBar\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['unavailable club product', shell.match(/\.clubProductUnavailable,[\s\S]*?\n\}/)?.[0] || ''],
    [
      'club admin panels',
      shell.match(/\.clubAdminStat,[\s\S]*?\.clubAdminRow\s*\{[\s\S]*?\n\}/)?.[0] || '',
    ],
    [
      'club admin fields',
      shell.match(/\.clubAdminCreatePanel :is\(input, select\)\s*\{[\s\S]*?\n\}/)?.[0] || '',
    ],
    [
      'club ownership notice',
      shell.match(/\.clubAdminOwnershipNotice\s*\{[\s\S]*?\n\}/)?.[0] || '',
    ],
    ['dialog metric', shell.match(/\.dialogMetric\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['mobile hero overlay', heroOverlays.at(-1)?.[0] || ''],
    ['reward cap banner', legacyStyles.match(/capBanner:\s*\{[\s\S]*?\n\s*\},/)?.[0] || ''],
    ['merch product card', merch.match(/\.productCard\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['unavailable merch media', merch.match(/\.mediaUnavailable\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['reward progress fill', telemetry.match(/\.progressTrack span\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    [
      'store product cards',
      storeCards.match(/\.packageCard,[\s\S]*?\.merchCard\s*\{[\s\S]*?\n\}/)?.[0] || '',
    ],
    ['store package badge', storeCards.match(/\.packageBadge\s*\{[\s\S]*?\n\}/)?.[0] || ''],
  ];

  for (const [label, rule] of flatRules) {
    assert.ok(rule, `expected ${label} rule`);
    assert.doesNotMatch(rule, /(?:linear|radial|conic)-gradient|border-left/, label);
  }

  assert.doesNotMatch(shell, /\.clubAdmin(?:CreatePanel|Row)::before/);
  assert.doesNotMatch(shell, /border-left/);
});

test('the full painted Marketplace scope rejects gradients and decorative left edges', () => {
  const prohibitedPaint =
    /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(|border-left(?:-[a-z]+)?\s*:|borderLeft(?:Color|Style|Width)?\s*:/i;

  for (const file of paintedMarketplaceScope) {
    assert.doesNotMatch(read(file), prohibitedPaint, file);
  }
});

test('residual Marketplace surfaces retain the no-hover, no-green, no-long-bar contract', () => {
  const source = Object.values(files).map(read).join('\n');
  assert.doesNotMatch(source, /:hover/);
  assert.doesNotMatch(source, /\b(?:green|lime|purple|violet|magenta)\b/i);
  assert.doesNotMatch(source, /[\u2013\u2014]/u);
});
