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

test('VIP benefit rows are readable cards, and FAQ rows keep their painted hardware', () => {
  const shell = read('src/components/diamond-store/DiamondStoreShell.module.css');
  const legacyStyles = read('src/components/diamond-store/diamondStoreStyles.js');
  const store = read('pages/hub/diamond-store.js');

  const benefit = shell.match(/\.premiumDataCard\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const faqRow = shell.match(/\.vipFaq details\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const faqQuestion = shell.match(/\.vipFaq summary\s*\{[\s\S]*?\n\}/)?.[0] || '';

  // A benefit row is text and a value, so it is sized by its text. The painted
  // three-slice housing it used to sit in forced 220px and clipped: measured on
  // production at 1440px, the longest benefit filled 115px of a 115.2px content
  // box inside overflow: hidden, with 57.9px/52.1px of ornamental padding.
  assert.doesNotMatch(benefit, /min-height:\s*[1-9]/);
  assert.doesNotMatch(benefit, /padding:[^;]*%/);
  assert.doesNotMatch(benefit, /overflow:\s*hidden/);
  assert.match(benefit, /overflow:\s*visible/);

  // Restrained chrome, matching the accepted Marketplace footer. No new paint.
  assert.match(benefit, /background:\s*#070e15/);
  assert.match(benefit, /border:\s*1px solid #23394a/);
  assert.doesNotMatch(benefit, /(?:linear|radial|conic)-gradient|border-radius/);

  // The ornamental frame carried no text and was aria-hidden. It is gone from
  // both the stylesheet and the markup, not merely hidden.
  assert.doesNotMatch(shell, /premiumDataFrame/);
  assert.doesNotMatch(store, /premiumDataFrame/);

  // Entitlement copy has to be readable: 11px at rgba(255,255,255,0.5) was not.
  const desc = legacyStyles.match(/benefitDesc:\s*\{[\s\S]*?\n\s*\},/)?.[0] || '';
  assert.match(desc, /fontSize:\s*1[3-9]/);
  assert.doesNotMatch(desc, /rgba\(255,\s*255,\s*255,\s*0\.5\)/);

  // Two columns on desktop, one column once the row cannot hold two.
  assert.match(shell, /\.vipBenefits \.responsiveGrid\s*\{[\s\S]*?repeat\(2,/);
  assert.match(
    shell,
    /@media \(max-width: 640px\)[\s\S]*?\.vipBenefits \.responsiveGrid\s*\{[\s\S]*?minmax\(0, 1fr\)/
  );

  // A question and its answer are sized by their text. The row used to be a
  // wallet-row-shell plate locked to aspect-ratio 1800/386 with 24% of its
  // width reserved for an empty octagonal slot, inside overflow: hidden.
  const faqAnswer = shell.match(/\.vipFaq details > p\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(faqRow, /aspect-ratio/);
  assert.doesNotMatch(faqRow, /wallet-row-shell/);
  assert.doesNotMatch(faqRow, /overflow:\s*hidden/);
  assert.match(faqRow, /border:\s*1px solid #23394a/);
  assert.match(faqRow, /background:\s*#070e15/);
  assert.doesNotMatch(faqRow, /(?:linear|radial|conic)-gradient|border-left/);

  // The question stays a 48px touch target and carries no painted plate.
  assert.match(faqQuestion, /min-height:\s*48px/);
  assert.doesNotMatch(faqQuestion, /url\(/);
  assert.doesNotMatch(faqQuestion, /aspect-ratio/);
  assert.doesNotMatch(faqQuestion, /(?:linear|radial|conic)-gradient|border-left/);

  // The answer is a paragraph, never a near-square painted panel.
  assert.doesNotMatch(faqAnswer, /aspect-ratio/);
  assert.doesNotMatch(faqAnswer, /url\(/);

  // Mobile does not re-paint what desktop stopped painting.
  const faqMobile = shell.match(/@media \(max-width: 640px\)[\s\S]*$/)?.[0] || '';
  assert.doesNotMatch(faqMobile, /\.vipFaq summary\s*\{[^}]*url\(/);
  assert.doesNotMatch(faqMobile, /\.vipFaq details > p\s*\{[^}]*aspect-ratio/);

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
