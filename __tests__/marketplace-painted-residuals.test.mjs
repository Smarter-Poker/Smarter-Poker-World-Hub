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

test('transaction notices use content-driven image-free status surfaces', () => {
  const checkout = read(files.checkout);
  const toast = read(files.toast);
  const toastComponent = read(files.toastComponent);

  const checkoutPanel = checkout.match(/\.panel\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const toastPanel = toast.match(/\.toast\s*\{[\s\S]*?\n\}/)?.[0] || '';
  for (const [label, rule] of [
    ['checkout status', checkoutPanel],
    ['toast status', toastPanel],
  ]) {
    assert.ok(rule, `expected ${label} rule`);
    assert.match(rule, /min-height:\s*\d+px/);
    assert.match(rule, /border:\s*1px solid/);
    assert.match(rule, /background:\s*#/);
    assert.doesNotMatch(rule, /url\(|aspect-ratio|padding:\s*calc\(|(?:linear|radial)-gradient/);
  }

  const checkoutControls =
    checkout.match(/\.primaryAction,\n\.secondaryAction,\n\.dismiss\s*\{[\s\S]*?\n\}/)?.[0] ||
    '';
  const toastDismiss = toast.match(/\.dismiss\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(checkoutControls, /min-height:\s*44px/);
  assert.match(checkoutControls, /border:\s*1px solid/);
  assert.match(toastDismiss, /min-height:\s*44px/);
  assert.match(toastDismiss, /border:\s*1px solid/);
  assert.match(toastDismiss, /background:\s*#/);
  assert.doesNotMatch(
    `${checkout}\n${toastDismiss}`,
    /marketplace-console-v1|url\(|aspect-ratio|(?:linear|radial|conic)-gradient/
  );
  assert.doesNotMatch(toastComponent, /TOAST_STYLES|--toast-bg|linear-gradient/);
});

test('merchandise confirmation uses one readable restrained purchase card', () => {
  const component = read(files.dialogComponent);
  const styles = read(files.dialog);

  assert.doesNotMatch(component, /styles\.(?:rail|seal)/);
  assert.doesNotMatch(styles, /spade-console|marketplace-console-v1|aspect-ratio/);
  const panel = styles.match(/\.panel\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(panel, /border:\s*1px solid #496979/);
  assert.doesNotMatch(panel, /padding:\s*\d+(?:\.\d+)?%/);
  assert.match(styles, /\.actions\s*\{[\s\S]*?grid-template-columns:[\s\S]*?background:\s*#08131b/);
  assert.match(styles, /\.close\s*\{[\s\S]*?min-height:\s*44px/);
});

test('reward and VIP live data use content-driven rows without duplicate outer consoles', () => {
  const telemetry = read(files.telemetry);
  const vip = read(files.vip);

  const contentRules = [
    ['reward console', telemetry.match(/\.console\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['reward circuit', telemetry.match(/\.circuit\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['reward state', telemetry.match(/\.statePanel\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['VIP status', vip.match(/\.statusLine div\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['VIP plan', vip.match(/\.plan\s*\{[\s\S]*?\n\}/)?.[0] || ''],
  ];
  for (const [label, rule] of contentRules) {
    assert.ok(rule, `expected ${label} rule`);
    assert.match(rule, /border:\s*1px solid/);
    assert.match(rule, /background:\s*#/);
    assert.doesNotMatch(
      rule,
      /url\(|aspect-ratio|padding:\s*\d+(?:\.\d+)?%|(?:linear|radial|conic)-gradient/,
      label
    );
  }

  // The confirmation dialog is the one place that housing could not stay. Its
  // `padding: 17%` resolved against the fixed backdrop, not the 520px dialog:
  // 211px a side at 1280px wide and 239px at 1440px. With `aspect-ratio`
  // deriving the height from the width, the box measured 973px tall inside a
  // 720px viewport and 1285px inside 1000px, and nothing could scroll. Both
  // action buttons sat below the fold at top 720 and top 1006 and could not be
  // clicked at all, so a member on a desktop could not confirm a plan switch or
  // a cancellation. It is a readable commerce card now, and it is bounded.
  const dialog = vip.match(/\n\.dialog \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(dialog, 'the VIP dialog rule is gone');
  assert.doesNotMatch(dialog, /utility\/utility-shell\.webp/);
  assert.doesNotMatch(dialog, /aspect-ratio/);
  assert.doesNotMatch(dialog, /padding:\s*\d+(?:\.\d+)?%/);
  assert.match(dialog, /max-height:\s*100%/);
  assert.match(dialog, /overflow-y:\s*auto/);
  const dialogActions = vip.match(/\.dialogActions \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(dialogActions, /margin-top:\s*auto/, 'the actions must stay at the end of the flow');
  const vipPanel = vip.match(/\.panel\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(vipPanel, /background:\s*#07131b/);
  assert.doesNotMatch(vipPanel, /url\(|(?:linear|radial|conic)-gradient/);
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

  // Status surfaces are content-sized and keep chrome as a restrained accent.
  for (const plate of ['balanceReadout', 'catalogAlert']) {
    const rule = merch.match(new RegExp(`\\.${plate} \\{[\\s\\S]*?\\n\\}`))?.[0] || '';
    assert.ok(rule, `${plate} rule is gone`);
    assert.doesNotMatch(rule, /url\(|aspect-ratio|padding:\s*calc\(/);
    assert.match(rule, /border:\s*1px solid/);
    assert.match(rule, /background:\s*#/);
  }
  // .emptyState used to be the same 1105/1133 housing with `padding: 18%`
  // resolving against the page column: an 18px content box inside a 440px
  // plate. An empty state is a sentence and a control, so it is sized by them.
  const emptyState = merch.match(/\.emptyState \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(emptyState, 'the merch empty state rule is gone');
  assert.doesNotMatch(emptyState, /utility\/utility-shell\.webp/);
  assert.doesNotMatch(emptyState, /padding:\s*\d+(?:\.\d+)?%/);
  assert.doesNotMatch(
    merch.match(/\.productCard\s*\{[\s\S]*?\n\}/)?.[0] || '',
    /navigation\/nav-shell|shark-panel\/bay|utility\/utility-shell/
  );

  const fulfillmentStatus = fulfillment.match(/\.status\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(fulfillmentStatus, 'the fulfillment status rule is gone');
  assert.doesNotMatch(fulfillmentStatus, /url\(|aspect-ratio|padding:\s*calc\(/);
  assert.match(fulfillmentStatus, /min-height:\s*44px/);
  // The fulfillment dialog carried the VIP dialog's fault: `padding: 16%`
  // against the fixed backdrop rather than the 620px dialog, which is 223px a
  // side at 1440, 300px at 1920, and a content box that reaches zero at about
  // 1982px. max-height kept its actions reachable, so only the horizontal
  // collapse showed. Readable card now, like the VIP one.
  const fulfillmentDialog = fulfillment.match(/\n\.dialog \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(fulfillmentDialog, 'the fulfillment dialog rule is gone');
  assert.doesNotMatch(fulfillmentDialog, /utility\/utility-shell\.webp/);
  assert.doesNotMatch(fulfillmentDialog, /aspect-ratio/);
  assert.doesNotMatch(fulfillmentDialog, /padding:\s*\d+(?:\.\d+)?%/);
  assert.match(fulfillmentDialog, /overflow-y:\s*auto/);
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

// ───────────────────────────────────────────────────────────────────────────
// Phase 7 (2026-09-19): the commerce surfaces. Every assertion below pins a
// defect that was measured in a headless render before it was fixed, so a
// revert turns one of them red rather than silently shipping the ornament
// back. Measurements are quoted in each block.
// ───────────────────────────────────────────────────────────────────────────

const commerceFiles = {
  fulfillment: 'pages/hub/merch-store/fulfillment.js',
  fulfillmentCss: 'pages/hub/merch-store/fulfillment.module.css',
  cart: 'pages/hub/diamond-store/cart.js',
  cartCss: 'pages/hub/diamond-store/cart.module.css',
  orders: 'pages/hub/diamond-store/orders.js',
  receipt: 'pages/hub/diamond-store/orders/[orderId].js',
  wishlist: 'pages/hub/diamond-store/wishlist.js',
  subpageShell: 'src/components/store/MarketplaceSubpageShell.module.css',
};

const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// Every `font-size` / `fontSize` literal in a source, normalised to px.
// Unitless numbers are React inline styles, which the DOM reads as px.
// clamp() is read at its first argument, which is its floor.
const fontSizesIn = (source) => {
  const sizes = [];
  for (const [, rawValue] of withoutComments(source).matchAll(
    /(?:font-size\s*:\s*|\bfontSize\s*:\s*)('[^']*'|"[^"]*"|[^;,\n}]+)/g
  )) {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, '');
    for (const [, digits, unit] of value.matchAll(/(-?\d*\.?\d+)\s*([a-z%]*)/g)) {
      if (unit === 'px' || unit === '') sizes.push({ px: Number(digits), value });
      else if (unit === 'rem' || unit === 'em') sizes.push({ px: Number(digits) * 16, value });
    }
  }
  return sizes;
};

test('no commerce surface renders text below 12px', () => {
  // Measured before this change, at a 16px root: fulfillment .status 11.68px,
  // its order-id code and label hint 11.52px, its quarantine note 11.84px;
  // the orders fulfillment eyebrow 9px, its rail label 11px, its rail date
  // and tracking meta 10px; the wishlist product type 9px.
  const offenders = [];
  for (const [name, file] of Object.entries(commerceFiles)) {
    for (const size of fontSizesIn(read(file))) {
      if (size.px < 12) offenders.push(`${name}: ${size.value} (${size.px}px)`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the fulfillment status is content-sized without an ornamental plate', () => {
  const fulfillmentCss = read(commerceFiles.fulfillmentCss);
  const statusRule = fulfillmentCss.match(/\.status \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(statusRule, 'expected the .status rule');
  const statusDeclarations = withoutComments(statusRule);
  assert.doesNotMatch(statusRule, /url\(|aspect-ratio|wallet-row-shell/);
  assert.doesNotMatch(statusDeclarations, /padding:\s*calc\(|padding:[^;]*\d+(?:\.\d+)?%/);
  assert.match(statusRule, /width: min\(1180px, 100%\);/);
  assert.match(statusRule, /min-height: 44px;/);
  assert.match(statusRule, /padding: 12px 16px;/);
  assert.match(statusRule, /border: 1px solid #314957;/);
  assert.match(statusRule, /background: #071017;/);
  assert.doesNotMatch(statusDeclarations, /padding:[^;]*\d+(?:\.\d+)?%/);
  assert.doesNotMatch(statusDeclarations, /container-type|cqw/);
});

test('a merchandise order identifier is never truncated on the fulfillment console', () => {
  const fulfillmentCss = read(commerceFiles.fulfillmentCss);
  const codeRule = fulfillmentCss.match(/\.orderTop code,\n\.quarantine code \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(codeRule, 'expected the shared order-identifier rule');
  assert.match(codeRule, /overflow-wrap: anywhere;/);
  assert.doesNotMatch(codeRule, /max-width:\s*\d/);
  assert.doesNotMatch(codeRule, /text-overflow|overflow:\s*hidden/);
});

test('commerce shells reserve the footer once, through BottomNavSpacer', () => {
  // pages/_app.js renders BottomNavSpacer at exactly the footer height
  // (measured 132px desktop, 48.1px mobile). The shell added another 76px and
  // the fulfillment page another 120px on top of that, covering nothing.
  const subpageShell = read(commerceFiles.subpageShell);
  const fulfillmentCss = read(commerceFiles.fulfillmentCss);
  assert.match(subpageShell, /\.stage \{[\s\S]*?padding: 14px 0 0;/);
  assert.doesNotMatch(subpageShell, /calc\(76px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(fulfillmentCss, /\.page \{[\s\S]*?padding: 92px 22px 0;/);
  assert.doesNotMatch(fulfillmentCss, /padding: 92px 22px 120px;/);
});

test('cart and wishlist frames carry no empty painted slice', () => {
  // Measured at 1440 before this change: a 688px cart line was 349.95px tall
  // and 215.56px of that (61.6%) was two empty aria-hidden slice divs; the
  // 400px summary 125.32px of 657.08 (19.1%); a 550px wishlist card 172.32px
  // of 611 (28.2%). None of the four divs had a child.
  const cart = read(commerceFiles.cart);
  const cartCss = withoutComments(read(commerceFiles.cartCss));
  const wishlist = read(commerceFiles.wishlist);

  assert.doesNotMatch(cart, /FrameTop|FrameBottom/);
  assert.doesNotMatch(wishlist, /wishlistFrameTop|wishlistFrameBottom/);
  assert.doesNotMatch(cartCss, /FrameTop|FrameBottom|shark-panel\/(?:top|mid|bottom)\.png/);
  assert.doesNotMatch(withoutComments(wishlist), /shark-panel\/(?:top|mid|bottom)\.png/);

  // Restrained chrome, and overflow stays visible: it clips nothing.
  assert.match(cartCss, /\.cartItemFrame,\n\.summaryFrame \{[\s\S]*?overflow: visible;/);
  assert.match(cartCss, /border: 1px solid #23394a;/);
  assert.match(cartCss, /background: #070e15;/);
  assert.match(withoutComments(wishlist), /border: '1px solid #23394a'/);
  assert.match(withoutComments(wishlist), /backgroundColor: '#070e15'/);
});

test('the anonymous fulfillment console says so and refuses its own actions', () => {
  // Signed out, the console used to render full chrome, a hero and two
  // enabled actions, with one 11.68px line as the only sign of the gate.
  const fulfillment = read(commerceFiles.fulfillment);
  assert.match(fulfillment, /const signedOut = authResolved && !authOwnerId;/);
  assert.match(fulfillment, /disabled=\{state\.kind === 'loading' \|\| signedOut\}/);
  assert.match(
    fulfillment,
    /<Link href="\/auth\/login\?redirect=\/hub\/merch-store\/fulfillment">/
  );
  // Same tab, and still not a redirecting auth gate.
  assert.doesNotMatch(fulfillment, /target=|window\.open/);
  assert.doesNotMatch(fulfillment, /useRequireAuth/);
});

test('the rewards family is sized by its content, not by painted geometry', () => {
  const telemetry = read('src/components/store/RewardTelemetryConsole.module.css');
  const shell = read('src/components/diamond-store/DiamondStoreShell.module.css');
  const legacy = read('src/components/diamond-store/diamondStoreStyles.js');
  const store = read('pages/hub/diamond-store.js');

  // The sign-in panel on all 100 reward detail pages. Percentage padding
  // resolves against the containing block, so 18% of a 1180px parent put
  // 212.39px on every side of a 440px box and left a 15.2px content column.
  const statePanel = telemetry.match(/\.statePanel\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(statePanel, '.statePanel rule must exist');
  assert.doesNotMatch(statePanel, /padding:[^;]*%/);
  assert.doesNotMatch(statePanel, /aspect-ratio/);
  assert.doesNotMatch(statePanel, /utility-shell/);
  assert.match(statePanel, /border:\s*1px solid #23394a/);
  assert.match(statePanel, /background:\s*#070e15/);

  // 67 Easter Egg cards were held open at 210px around 123-159px of content,
  // inside overflow: hidden, behind three concentric painted rings.
  const casino =
    shell.match(/\.casinoDataCard,\n\.casinoProductCard\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(casino, 'the casino card rule must exist');
  assert.match(casino, /overflow:\s*visible/);
  assert.doesNotMatch(casino, /inset 0 0 0 5px/);
  assert.doesNotMatch(shell, /\.casinoProductCard\s*\{\s*min-height/);

  // A pseudo-element with transparent background, no shadow and empty content
  // painted nothing, 70 times per page.
  assert.doesNotMatch(shell, /\.casinoProductCard::before/);

  // The only route into the 100 detail pages needs a real hit box. min-height
  // does not apply to a non-replaced inline box, which is why the global
  // mobile floor computed 44px while the anchor rendered 19px.
  const linkRule = shell.match(/\.rewardDetailLink\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(linkRule, /display:\s*inline-block/);
  assert.match(linkRule, /padding-block:\s*14px/);
  assert.match(linkRule, /margin-block:\s*-14px/);
  assert.match(store, /className=\{shellStyles\.rewardDetailLink\}/);

  // Declarations that read as armed and provably did nothing.
  const subNav = legacy.match(/rewardsSubNav:\s*\{[\s\S]*?\n\s{2}\},/)?.[0] || '';
  assert.doesNotMatch(subNav, /position:\s*'sticky'/);
  assert.doesNotMatch(subNav, /zIndex/);

  // No text under 12px in the rewards style surfaces.
  for (const [name, source] of [
    ['diamondStoreStyles.js', legacy],
    ['DiamondStoreShell.module.css', shell],
    ['RewardTelemetryConsole.module.css', telemetry],
  ]) {
    const tooSmall = [];
    for (const m of source.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)\b/g)) {
      if (Number(m[1]) < 12) tooSmall.push(`fontSize: ${m[1]}`);
    }
    for (const m of source.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      if (Number(m[1]) < 12) tooSmall.push(`font-size: ${m[1]}px`);
    }
    for (const m of source.matchAll(/font:\s*[^;]*?\b(\d+(?:\.\d+)?)px\b/g)) {
      if (Number(m[1]) < 12) tooSmall.push(`font shorthand: ${m[1]}px`);
    }
    assert.deepEqual(tooSmall, [], `${name} still declares text under 12px: ${tooSmall.join(', ')}`);
  }
});

test('every active Club Shop product resolves to real artwork, and unknowns still fail closed', async () => {
  const { resolveClubShopProductArt } = await import('../src/lib/store/clubShopProductArt.js');

  // The live catalog, read from public.club_shop_items where is_active, on
  // 2026-09-19. Two of these resolved to kind:'unavailable' and rendered an
  // empty "Reviewed Product Art Unavailable" panel, because the art map was
  // never renamed with the products: the map said 'Crown Avatar' while the
  // catalog said 'Royal Monarch Avatar', and 'Time Bank +30s' while the
  // catalog said '30s Time Bank'. The crown tile sat orphaned in the atlas.
  const liveCatalog = [
    ['Royal Monarch Avatar', 'Avatars', 'avatar', 'avatar', null],
    ['Shark Avatar', 'Avatars', 'avatar', 'avatar', null],
    ['Classic Emote Pack', 'Emotes', 'emote', 'emote_pack', null],
    ['Premium Emote Pack', 'Emotes', 'emote', 'emote_pack', null],
    ['Midnight Felt Table Skin', 'Table Skins', 'table_skin', 'table_skin', null],
    ['Royal Gold Table Skin', 'Table Skins', 'table_skin', 'table_skin', null],
    ['All Throwables Pack (10)', 'Throwables', 'throwable', 'throwable', 10],
    ['30s Time Bank', 'Time Banks', 'general', 'time_bank', 2],
    ['Time Bank +60s', 'Time Banks', 'time_bank', 'time_bank', 3],
    ['Time Bank Bundle (+100s)', 'Time Banks', 'time_bank', 'time_bank', 5],
  ];

  const missing = [];
  for (const [name, category, item_type, type, qty] of liveCatalog) {
    const art = resolveClubShopProductArt({ name, category, item_type, grant_spec: { type, qty } });
    if (art.kind === 'unavailable') missing.push(name);
  }
  assert.deepEqual(missing, [], `these live products render no artwork: ${missing.join(', ')}`);

  // A Time Bank is defined by the grant it issues, not by item_type: the live
  // '30s Time Bank' row is item_type 'general'.
  assert.equal(
    resolveClubShopProductArt({
      name: 'Some Future Time Bank',
      category: 'Time Banks',
      item_type: 'general',
      grant_spec: { type: 'time_bank', qty: 1 },
    }).kind,
    'atlas'
  );

  // Failing closed is the point of this resolver and must survive the fix.
  for (const unknown of [
    { name: 'Totally Unknown Thing', category: 'Mystery', item_type: 'x', grant_spec: { type: 'y' } },
    { name: 'Royal Monarch Avatar', category: 'Table Skins', item_type: 'avatar', grant_spec: { type: 'avatar' } },
    { name: 'All Throwables Pack (10)', category: 'Throwables', item_type: 'throwable', grant_spec: { type: 'throwable', qty: 3 } },
  ]) {
    assert.equal(
      resolveClubShopProductArt(unknown).kind,
      'unavailable',
      `${unknown.name} must fail closed when its identity does not match`
    );
  }
});

test('the Club Shop card states what a shopper owns, and paints only its controls', () => {
  const shell = read('src/components/diamond-store/DiamondStoreShell.module.css');
  const store = read('pages/hub/diamond-store.js');

  // marketplace-items returns my_purchase_count and clubCardCheckout
  // validates it; the card was the only place that dropped it.
  assert.match(store, /item\.my_purchase_count/);

  // A category label is a span. It wore the same painted plate as the real
  // purchase buttons.
  const category = shell.match(/\.clubItemCategory\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(category, /button-secondary\.png/);
  assert.match(category, /border:\s*1px solid #23394a/);

  // A floor that never applied, and a floor that was quietly overridden.
  assert.doesNotMatch(shell.match(/\.clubItemBody\s*\{[\s\S]*?\n\}/)?.[0] || '', /min-height/);
  assert.doesNotMatch(
    shell.match(/\.clubItemActions button\s*\{[\s\S]*?\n\}/)?.[0] || '',
    /min-height:\s*4[0-3]px/
  );

  // No inline text under 12px anywhere on the Marketplace store page.
  const tooSmall = [];
  for (const m of store.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)\b/g)) {
    if (Number(m[1]) < 12) tooSmall.push(m[1]);
  }
  assert.deepEqual(tooSmall, [], `inline text under 12px remains: ${tooSmall.join(', ')}`);
});
