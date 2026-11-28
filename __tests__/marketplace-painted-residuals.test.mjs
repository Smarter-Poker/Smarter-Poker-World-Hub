import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  BANNED_TEXT_COLOUR,
  REJECTED_PAINTED_ART,
  SD_FILL,
  SD_FRAME,
  SMARTERDESIGN_GRADIENTS,
  hasSecondFrame,
  offStandardPaint,
} from './smarterdesign-standard.test.mjs';


const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

// 2026-11 #SMARTERDESIGN: the 2026-09 "no gradients, no url(), 1px hairline,
// no image surfaces" contracts below were replaced by the #SMARTERDESIGN
// materials (docs/SMARTERDESIGN.md). Each surface keeps its original intent
// (content-sized, readable, no rejected painted art, no decorative edge bars,
// no hover-only states, one frame per surface) but its paint must now be one
// of the standard chrome nine-slices over one of the four standard fills.
// Shared paint helpers live in __tests__/smarterdesign-standard.test.mjs.
const assertSdSurface = (rule, frame, label) => {
  assert.ok(rule, `expected ${label} rule`);
  assert.match(rule, SD_FRAME[frame], `${label} must carry the ${frame} chrome nine-slice`);
  assert.match(rule, SD_FILL, `${label} must use a standard #SMARTERDESIGN fill`);
  assert.deepEqual(offStandardPaint(rule), [], `${label} carries off-standard paint`);
  assert.doesNotMatch(rule, /aspect-ratio|padding:\s*calc\(|padding:\s*\d+(?:\.\d+)?%/, label);
  assert.doesNotMatch(rule, /border-left/, label);
  assert.equal(hasSecondFrame(rule), false, `${label} must not paint a second frame`);
};

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
  'src/components/store/DiamondWalletModal.jsx',
  'pages/hub/merch-store/fulfillment.module.css',
  'pages/hub/merch-store/fulfillment.js',
  'src/components/store/StoreCards.module.css',
  'src/components/store/MerchPurchaseDialog.module.css',
  'src/components/diamond-store/SmarterStoreShowcase.module.css',
  'src/components/diamond-store/StoreImageHeader.module.css',
  'src/components/diamond-store/CheckoutStatusPanel.module.css',
  'src/components/store/StoreToast.module.css',
  'src/components/store/MerchStore.module.css',
  'src/components/store/RewardTelemetryConsole.module.css',
  'src/components/store/ShoppingCart.module.css',
  'src/components/store/MarketplaceCommerceNav.module.css',
  'src/components/store/MarketplaceSubpageShell.module.css',
  'src/components/store/MarketplaceDetailExperience.module.css',
  'pages/hub/diamond-store/cart.module.css',
  'pages/hub/diamond-store/marketplace-account-controls.module.css',
  'pages/hub/diamond-store.js',
  'pages/hub/diamond-store/cart.js',
  'pages/hub/diamond-store/orders.js',
  'pages/hub/diamond-store/orders/[orderId].js',
  'pages/hub/diamond-store/wishlist.js',
  'src/components/store/ShoppingCart.jsx',
  'src/components/store/StoreCards.js',
  'src/components/store/MarketplaceDetailExperience.jsx',
  'src/components/diamond-store/diamondStoreStyles.js',
  // The VIP area (/hub/vip-membership, its plan and gift pages, Compare and
  // the Command Center) on the same #SMARTERDESIGN materials.
  'src/components/vip/VipKit.module.css',
  'src/components/vip/VipKit.jsx',
  'src/components/vip/VipManage.module.css',
  'src/components/store/VipMembershipPage.module.css',
  'src/components/store/VipMembershipConsole.module.css',
  'src/components/store/VipMembershipCard.module.css',
  'src/components/store/VipGifts.module.css',
  'src/components/store/VipGifts.jsx',
  'pages/hub/vip-membership.js',
  'pages/hub/vip-membership/[plan].js',
  'pages/hub/vip-membership/gift/[plan].js',
  'pages/hub/vip-membership/compare.js',
  'pages/hub/vip-membership/compare.module.css',
  'pages/hub/vip-membership/manage.js',
];

const vipCssScope = paintedMarketplaceScope.filter(
  (file) => /vip/i.test(file) && file.endsWith('.css')
);

test('transaction notices use content-driven #SMARTERDESIGN status surfaces', () => {
  const checkout = read(files.checkout);
  const toast = read(files.toast);
  const toastComponent = read(files.toastComponent);

  const checkoutPanel = checkout.match(/\.panel\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const toastPanel = toast.match(/\.toast\s*\{[\s\S]*?\n\}/)?.[0] || '';
  for (const [label, rule] of [
    ['checkout status', checkoutPanel],
    ['toast status', toastPanel],
  ]) {
    assert.match(rule, /min-height:\s*\d+px/);
    assertSdSurface(rule, 'panel', label);
    assert.match(rule, /border-radius:\s*0/, `${label} keeps square corners`);
  }

  const checkoutControls =
    checkout.match(/\.primaryAction,\n\.secondaryAction,\n\.dismiss\s*\{[\s\S]*?\n\}/)?.[0] ||
    '';
  const toastDismiss = toast.match(/\.dismiss\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(checkoutControls, /min-height:\s*44px/);
  assertSdSurface(checkoutControls, 'control', 'checkout controls');
  assert.match(toastDismiss, /min-height:\s*44px/);
  assertSdSurface(toastDismiss, 'control', 'toast dismiss');
  const primary = checkout.match(/\n\.primaryAction\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(primary, SD_FRAME.active, 'the primary checkout action is the cobalt control');
  assert.match(primary, new RegExp(SMARTERDESIGN_GRADIENTS.cobalt.replace(/[()]/g, '\\$&')));
  assert.deepEqual(offStandardPaint(`${checkout}\n${toast}`), []);
  assert.doesNotMatch(`${checkout}\n${toastDismiss}`, /aspect-ratio/);
  assert.doesNotMatch(toastComponent, /TOAST_STYLES|--toast-bg|gradient/);
});

test('merchandise confirmation uses one readable #SMARTERDESIGN purchase card', () => {
  const component = read(files.dialogComponent);
  const styles = read(files.dialog);

  assert.doesNotMatch(component, /styles\.(?:rail|seal)/);
  assert.doesNotMatch(styles, /spade-console|marketplace-console-v1|aspect-ratio/);
  const panel = styles.match(/\.panel\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assertSdSurface(panel, 'panel', 'merch dialog panel');
  assert.match(panel, /max-height:/, 'the dialog stays bounded');
  assert.match(panel, /overflow:\s*auto/, 'and scrolls rather than clipping');
  // One frame per surface: the action row inside the framed panel is unframed.
  const actions = styles.match(/\.actions\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(actions, /grid-template-columns:/);
  assert.match(actions, /background:\s*transparent/);
  assert.doesNotMatch(actions, /border-image/);
  const close = styles.match(/\.close\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(close, /min-height:\s*44px/);
  assertSdSurface(close, 'control', 'merch dialog close');
  assert.deepEqual(offStandardPaint(styles), []);
});

test('reward and VIP live data use content-driven rows without duplicate outer consoles', () => {
  const telemetry = read(files.telemetry);
  const vip = read(files.vip);

  // One frame per surface: the reward console is layout only, because every
  // circuit and state panel inside it carries its own chrome rim.
  const rewardConsole = telemetry.match(/\.console\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(rewardConsole, 'expected reward console rule');
  assert.match(rewardConsole, /border:\s*0/);
  assert.match(rewardConsole, /background:\s*transparent/);
  assert.doesNotMatch(rewardConsole, /border-image|url\(|gradient/);
  for (const [label, rule] of [
    ['reward circuit', telemetry.match(/\.circuit\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['reward state', telemetry.match(/\.statePanel\s*\{[\s\S]*?\n\}/)?.[0] || ''],
  ]) {
    assertSdSurface(rule, 'panel', label);
  }
  assert.deepEqual(offStandardPaint(telemetry), []);

  // The VIP membership console is on #SMARTERDESIGN: each readout and plan is
  // one content-sized chrome-stat well over the standard navy fill.
  for (const [label, rule] of [
    ['VIP status', vip.match(/\.statusLine div\s*\{[\s\S]*?\n\}/)?.[0] || ''],
    ['VIP plan', vip.match(/\.plan\s*\{[\s\S]*?\n\}/)?.[0] || ''],
  ]) {
    assertSdSurface(rule, 'well', label);
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
  assertSdSurface(dialog, 'panel', 'VIP confirmation dialog');
  const vipPanel = vip.match(/\.panel\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assertSdSurface(vipPanel, 'panel', 'VIP console panel');
  assert.deepEqual(offStandardPaint(vip), []);
});

test('the VIP area is on #SMARTERDESIGN chrome: no painted plates, chamfers or hover', () => {
  const kit = read('src/components/vip/VipKit.module.css');
  const page = read('src/components/store/VipMembershipPage.module.css');
  const card = read('src/components/store/VipMembershipCard.module.css');
  const manage = read('src/components/vip/VipManage.module.css');
  const gifts = read('src/components/store/VipGifts.module.css');
  const rule = (css, selector) =>
    css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] || '';

  // Every VIP stylesheet: standard paint only, square corners, no hover-only
  // states, no clipped chamfers, no text under 12px.
  for (const file of vipCssScope) {
    const css = withoutComments(read(file));
    assert.doesNotMatch(css, /:hover/, `${file} has a hover-only state`);
    assert.doesNotMatch(css, /clip-path:\s*polygon/, `${file} clips a chamfer`);
    assert.doesNotMatch(css, /vip-button-primary\.png|button-secondary\.png/, `${file} paints a retired plate`);
    assert.doesNotMatch(css, /border-radius:(?!\s*(?:0(?:px)?|50%)\s*(?:!important\s*)?;)/, `${file} rounds a corner`);
    for (const [, size] of css.matchAll(/font(?:-size)?:[^;]*?\b(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(size) >= 12, `${file} declares ${size}px text`);
    }
  }

  // The kit: one chrome-readout surface, chrome-stat price well, cobalt
  // primary, chrome-row secondary and close. The masthead keeps its 6px frame
  // and the shared "?" (see image-header-help-icon.law).
  assertSdSurface(rule(kit, '.price'), 'well', 'VIP price well');
  const cta = rule(kit, '.cta');
  assert.match(cta, SD_FRAME.active, 'the VIP primary action is chrome-active');
  assert.match(cta, new RegExp(SMARTERDESIGN_GRADIENTS.cobalt.replace(/[()]/g, '\\$&')));
  assert.match(rule(kit, '.cta,\n.ghost'), SD_FRAME.control, 'VIP actions are chrome-row controls');
  assertSdSurface(rule(kit, '.close'), 'control', 'VIP dialog close');
  assert.match(rule(kit, '.close'), /min-width: 44px;[\s\S]*min-height: 44px;/);

  // The storefront: chrome-row actions, cobalt primary, chrome-readout surfaces.
  assert.match(rule(page, '.primaryAction'), SD_FRAME.active);
  assert.match(page, SD_FRAME.panel);
  // The plan card: a chrome-stat well, chrome-active over cobalt when selected.
  assertSdSurface(rule(card, '.vipCard'), 'well', 'VIP plan card');
  assert.match(rule(card, '.vipCardSelected'), SD_FRAME.active);
  // The Command Center: readouts and notices are wells, fields are controls.
  assertSdSurface(rule(manage, '.readouts > div'), 'well', 'VIP readout');
  assertSdSurface(rule(manage, '.notice'), 'well', 'VIP notice');
  assertSdSurface(rule(manage, '.field'), 'control', 'VIP field');
  // Gifts: one panel, wells inside it.
  assertSdSurface(gifts.match(/^\.section \{[^}]*\}/m)?.[0] || '', 'panel', 'VIP gifts section');
});

test('VIP benefit rows are readable cards, and FAQ rows keep their #SMARTERDESIGN wells', () => {
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

  // #SMARTERDESIGN card: readout chrome over the card fill, square corners.
  assertSdSurface(benefit, 'panel', 'VIP benefit card');
  assert.doesNotMatch(benefit, /border-radius:\s*[1-9]/);

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
  assertSdSurface(faqRow, 'well', 'VIP FAQ row');

  // The question stays a 48px touch target inside the row's one frame: it
  // carries no plate or rim of its own.
  assert.match(faqQuestion, /min-height:\s*48px/);
  assert.match(faqQuestion, /border:\s*0/);
  assert.match(faqQuestion, /background:\s*transparent/);
  assert.doesNotMatch(faqQuestion, /url\(|aspect-ratio|gradient|border-left/);

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

  // Status surfaces are content-sized: a stat well for the balance, a readout
  // panel for the catalog alert.
  for (const [plate, frame] of [
    ['balanceReadout', 'well'],
    ['catalogAlert', 'panel'],
  ]) {
    const rule = merch.match(new RegExp(`\\.${plate} \\{[\\s\\S]*?\\n\\}`))?.[0] || '';
    assertSdSurface(rule, frame, plate);
  }
  // .emptyState used to be the same 1105/1133 housing with `padding: 18%`
  // resolving against the page column: an 18px content box inside a 440px
  // plate. An empty state is a sentence and a control, so it is sized by them.
  const emptyState = merch.match(/\.emptyState \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(emptyState, 'the merch empty state rule is gone');
  assert.doesNotMatch(emptyState, /utility\/utility-shell\.webp/);
  assert.doesNotMatch(emptyState, /padding:\s*\d+(?:\.\d+)?%/);
  assertSdSurface(emptyState, 'panel', 'merch empty state');
  const productCard = merch.match(/\.productCard\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(productCard, /navigation\/nav-shell|shark-panel\/bay|utility\/utility-shell/);
  assert.match(productCard, SD_FRAME.panel, 'a merch card is one chrome readout frame');
  assert.deepEqual(offStandardPaint(merch), []);

  const fulfillmentStatus = fulfillment.match(/\.status\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(fulfillmentStatus, 'the fulfillment status rule is gone');
  // The status is a #SMARTERDESIGN chrome-stat well; no painted plate image.
  assert.doesNotMatch(fulfillmentStatus, /aspect-ratio|padding:\s*calc\(/);
  assert.deepEqual(offStandardPaint(fulfillmentStatus), []);
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

test('upgraded Marketplace surfaces use only #SMARTERDESIGN paint and no decorative edge bars', () => {
  const fulfillment = read(files.fulfillment);
  const merch = read(files.merch);
  const shell = read(files.shell);
  const showcase = read(files.showcase);
  const legacyStyles = read(files.legacyStyles);
  const storeCards = read(files.storeCards);
  const telemetry = read(files.telemetry);

  // The old painted hero and its mobile overlay are gone: the store opens on
  // the shared StoreImageHeader instead (see diamond-store-smarterdesign).
  assert.doesNotMatch(showcase, /\.hero(?::after|\s*\{)|\.heroCopy|\.diamondHero|\.sectionHero/);

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
      shell.match(/\.clubAdminCreatePanel :is\(input, select(?:, textarea)?\)\s*\{[\s\S]*?\n\}/)?.[0] ||
        '',
    ],
    [
      'club ownership notice',
      shell.match(/\.clubAdminOwnershipNotice\s*\{[\s\S]*?\n\}/)?.[0] || '',
    ],
    ['dialog metric', shell.match(/\.dialogMetric\s*\{[\s\S]*?\n\}/)?.[0] || ''],
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
    assert.deepEqual(offStandardPaint(rule), [], label);
    assert.doesNotMatch(rule, /border-left|borderLeft/, label);
  }

  assert.doesNotMatch(shell, /\.clubAdmin(?:CreatePanel|Row)::before/);
  assert.doesNotMatch(shell, /border-left/);
});

test('the full painted Marketplace scope uses only #SMARTERDESIGN paint and no decorative left edges', () => {
  const decorativeLeftEdge =
    /border-left(?:-[a-z]+)?\s*:|borderLeft(?:Color|Style|Width)?\s*:/i;

  for (const file of paintedMarketplaceScope) {
    const source = read(file);
    assert.doesNotMatch(source, decorativeLeftEdge, file);
    assert.deepEqual(offStandardPaint(source), [], file);
    assert.doesNotMatch(source, REJECTED_PAINTED_ART, file);
    // The global Diamond Wallet modal (UniversalHeader) is on #SMARTERDESIGN
    // since 2026-11-27, so the text-colour rule is enforced here too.
    assert.doesNotMatch(source, BANNED_TEXT_COLOUR, `${file} paints banned text colours`);
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

// The whole Diamond Store scope (2026-11-27 polish): every store CSS module and
// every store page or component with inline styles, VIP files and the wallet
// modal excepted (their owners guard them). Unlike fontSizesIn this also reads
// the `font:` shorthand, multi-line or not, at its first length (a clamp()
// floor included), which is where the 9-11px labels used to hide.
const STORE_TEXT_SCOPE = [
  'src/components/diamond-store/CheckoutStatusPanel.jsx',
  'src/components/diamond-store/CheckoutStatusPanel.module.css',
  'src/components/diamond-store/DiamondStoreShell.module.css',
  'src/components/diamond-store/SmarterStoreShowcase.jsx',
  'src/components/diamond-store/SmarterStoreShowcase.module.css',
  'src/components/diamond-store/StoreImageHeader.jsx',
  'src/components/diamond-store/StoreImageHeader.module.css',
  'src/components/diamond-store/diamondStoreStyles.js',
  'src/components/store/ClubShopItemEditor.jsx',
  'src/components/store/ClubShopPurchaseLedger.jsx',
  'src/components/store/ClubShopSalesAnalytics.jsx',
  'src/components/store/MarketplaceCommerceNav.jsx',
  'src/components/store/MarketplaceCommerceNav.module.css',
  'src/components/store/MarketplaceDetailExperience.jsx',
  'src/components/store/MarketplaceDetailExperience.module.css',
  'src/components/store/MarketplaceSubpageShell.jsx',
  'src/components/store/MarketplaceSubpageShell.module.css',
  'src/components/store/MerchPurchaseDialog.jsx',
  'src/components/store/MerchPurchaseDialog.module.css',
  'src/components/store/MerchStore.jsx',
  'src/components/store/MerchStore.module.css',
  'src/components/store/RewardTelemetryConsole.jsx',
  'src/components/store/RewardTelemetryConsole.module.css',
  'src/components/store/ShoppingCart.jsx',
  'src/components/store/ShoppingCart.module.css',
  'src/components/store/StoreCards.js',
  'src/components/store/StoreCards.module.css',
  'src/components/store/StoreToast.jsx',
  'src/components/store/StoreToast.module.css',
  'pages/hub/diamond-store.js',
  'pages/hub/diamond-store/cart.js',
  'pages/hub/diamond-store/cart.module.css',
  'pages/hub/diamond-store/marketplace-account-controls.module.css',
  'pages/hub/diamond-store/orders.js',
  'pages/hub/diamond-store/orders/[orderId].js',
  'pages/hub/diamond-store/wishlist.js',
  'pages/hub/merch-store.js',
  'pages/hub/merch-store/[productId].js',
  'pages/hub/club-shop.js',
  'pages/hub/club-shop/[itemId].js',
  'pages/hub/smarter-rewards.js',
  'pages/hub/smarter-rewards/[rewardId].js',
];

const lengthPx = (digits, unit) =>
  unit === 'px' || unit === '' ? Number(digits) : unit === 'rem' || unit === 'em' ? Number(digits) * 16 : null;

const storeTextBelow12 = (file, source) => {
  const src = withoutComments(source);
  const found = [];
  for (const [, raw] of src.matchAll(
    /(?:(?<![-\w])font-size\s*:\s*|\bfontSize\s*:\s*)('[^']*'|"[^"]*"|[^;,\n}]+)/g
  )) {
    const value = raw.trim().replace(/^['"]|['"]$/g, '');
    for (const [, digits, unit] of value.matchAll(/(-?\d*\.?\d+)\s*(px|rem|em|)(?![\w%])/g)) {
      const px = lengthPx(digits, unit);
      if (px !== null && px < 12) found.push(`${file}: font-size ${value}`);
    }
  }
  const shorthand = file.endsWith('.css')
    ? /(?<![-\w])font\s*:\s*([^;}]+)/g
    : /(?<![-\w])font\s*:\s*['"`]([^'"`]*)['"`]/g;
  for (const [, value] of src.matchAll(shorthand)) {
    const first = value.match(/(\d*\.?\d+)(px|rem|em)\b/);
    if (first && lengthPx(first[1], first[2]) < 12) {
      found.push(`${file}: font ${value.replace(/\s+/g, ' ').slice(0, 48)}`);
    }
  }
  return found;
};

test('no commerce text below 12px anywhere in the Diamond Store scope', () => {
  // Measured before: CheckoutStatusPanel labels 9-11px, MerchStore
  // .catalogAlert 10px and eleven more 9-11px merch labels, StoreToast and
  // MerchPurchaseDialog 10-11px phone buttons, the cart close/remove 11px.
  const offenders = STORE_TEXT_SCOPE.flatMap((file) => storeTextBelow12(file, read(file)));
  assert.deepEqual(offenders, []);
  // The sweep itself reads both forms, so it cannot pass vacuously.
  assert.equal(storeTextBelow12('x.css', '.a { font: 700 9px Inter; }').length, 1);
  assert.equal(storeTextBelow12('x.css', '.a {\n  font:\n    800 clamp(11px, 1vw, 15px) / 1 Inter;\n}').length, 1);
  assert.equal(storeTextBelow12('x.js', "const a = { fontSize: 11, font: '700 10px Inter' };").length, 2);
  assert.equal(storeTextBelow12('x.css', '.a { font-size: 0.7rem; }').length, 1);
  assert.equal(storeTextBelow12('x.css', '.a { font: 800 12px/1 Inter; font-size: 12px; }').length, 0);
});

test('the fulfillment status is content-sized without an ornamental plate', () => {
  const fulfillmentCss = read(commerceFiles.fulfillmentCss);
  const statusRule = fulfillmentCss.match(/\.status \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(statusRule, 'expected the .status rule');
  const statusDeclarations = withoutComments(statusRule);
  assert.doesNotMatch(statusRule, /aspect-ratio|wallet-row-shell/);
  assert.deepEqual(offStandardPaint(statusRule), [], 'only the chrome kit may paint the status');
  assert.doesNotMatch(statusDeclarations, /padding:\s*calc\(|padding:[^;]*\d+(?:\.\d+)?%/);
  assert.match(statusRule, /width: min\(1180px, 100%\);/);
  assert.match(statusRule, /min-height: 44px;/);
  assert.match(statusRule, /padding: 12px 16px;/);
  // #SMARTERDESIGN: the status line is one chrome-stat well on the navy fill.
  assertSdSurface(statusRule, 'well', 'fulfillment status');
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

  // One #SMARTERDESIGN readout frame per card, and overflow stays visible: it
  // clips nothing.
  const cartFrame = cartCss.match(/\.cartItemFrame,\n\.summaryFrame \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(cartFrame, /overflow: visible;/);
  assertSdSurface(cartFrame, 'panel', 'cart item and summary frame');
  const wishlistItem =
    withoutComments(wishlist).match(/wishlistItem:\s*\{[\s\S]*?\n\s*\},/)?.[0] || '';
  assert.match(wishlistItem, /overflow: 'visible'/);
  assert.match(wishlistItem, /border: '5px solid transparent',\s*borderImage: "url\('\/images\/smarterdesign\/chrome-readout\.webp'\)/);
  assert.match(wishlistItem, /background: 'linear-gradient\(155deg, #162a3f 0%, #0a1a2a 43%, #050e18 87%\)'/);
  assert.deepEqual(offStandardPaint(wishlist), []);
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
  assertSdSurface(statePanel, 'panel', 'reward sign-in state panel');

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
  // It reads as a #SMARTERDESIGN stat well (a label), never as a control.
  assertSdSurface(category, 'well', 'club item category');
  assert.doesNotMatch(category, /chrome-(?:row|active)\.webp/);

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
