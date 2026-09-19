import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const paths = {
  console: 'src/components/marketplace-console/MarketplaceConsole.jsx',
  consoleCss: 'src/components/marketplace-console/MarketplaceConsole.module.css',
  index: 'src/components/marketplace-console/index.js',
  manifest: 'public/images/marketplace-console-v1/manifest.json',
  readme: 'src/components/marketplace-console/README.md',
  showcase: 'src/components/diamond-store/SmarterStoreShowcase.jsx',
  showcaseCss: 'src/components/diamond-store/SmarterStoreShowcase.module.css',
  cards: 'src/components/store/StoreCards.js',
  cardsCss: 'src/components/store/StoreCards.module.css',
  diamondStore: 'pages/hub/diamond-store.js',
  diamondStoreCss: 'src/components/diamond-store/DiamondStoreShell.module.css',
  catalog: 'src/data/diamondStoreData.js',
  shopRules: 'src/lib/club-arena/shopItemRules.js',
  wallet: 'src/components/store/DiamondWalletModal.jsx',
  walletCss: 'src/components/store/DiamondWalletModal.module.css',
  commerceNav: 'src/components/store/MarketplaceCommerceNav.jsx',
  commerceNavCss: 'src/components/store/MarketplaceCommerceNav.module.css',
  cart: 'pages/hub/diamond-store/cart.js',
  cartCss: 'pages/hub/diamond-store/cart.module.css',
  rewardsCatalog: 'src/config/diamondRewards.js',
  toastCss: 'src/components/store/StoreToast.module.css',
  packageJson: 'package.json',
  vercelIgnore: '.vercelignore',
  app: 'pages/_app.js',
};

const marketplaceTypographyFiles = [
  paths.diamondStore,
  paths.consoleCss,
  paths.showcaseCss,
  paths.cart,
  paths.cartCss,
  'pages/hub/diamond-store/orders.js',
  'pages/hub/diamond-store/orders/[orderId].js',
  'pages/hub/diamond-store/wishlist.js',
  'pages/hub/merch-store/fulfillment.module.css',
  'src/components/diamond-store/CheckoutStatusPanel.module.css',
  'src/components/diamond-store/DiamondStoreShell.module.css',
  'src/components/diamond-store/diamondStoreStyles.js',
  'src/components/store/DiamondWalletModal.jsx',
  'src/components/store/DiamondWalletModal.module.css',
  'src/components/store/MarketplaceCommerceNav.module.css',
  'src/components/store/MarketplaceDetailExperience.module.css',
  'src/components/store/MarketplaceSubpageShell.module.css',
  'src/components/store/MerchPurchaseDialog.module.css',
  'src/components/store/MerchStore.module.css',
  'src/components/store/RewardTelemetryConsole.module.css',
  'src/components/store/ShoppingCart.jsx',
  'src/components/store/ShoppingCart.module.css',
  'src/components/store/StoreCards.module.css',
  'src/components/store/StoreToast.module.css',
  'src/components/store/VipMembershipConsole.module.css',
];

const rejectedSelectorFiles = [
  'club-shop.png',
  'diamond-store.png',
  'merch-store.png',
  'smarter-rewards.png',
  'vip-membership.png',
].map((name) => path.join(root, 'public/images/marketplace-console-v1/selectors', name));
const rejectedRewardAtlas = path.join(root, 'public/images/store-v3/reward-category-atlas-v1.png');
const rejectedVipReplacementFiles = ['annual.png', 'lifetime.png', 'monthly.png'].map((name) =>
  path.join(root, 'public/images/marketplace-console-v1/vip-plans', name)
);

test('Marketplace keeps its existing route navigation instead of standalone objects', async () => {
  const [component, styles, index, showcase, showcaseStyles, commerceNav, commerceNavStyles] =
    await Promise.all([
      read(paths.console),
      read(paths.consoleCss),
      read(paths.index),
      read(paths.showcase),
      read(paths.showcaseCss),
      read(paths.commerceNav),
      read(paths.commerceNavCss),
    ]);

  assert.match(showcase, /<nav className=\{styles\.tabs\}/);
  assert.match(showcase, /<Link[\s\S]*?href=\{TAB_ROUTES\[id\]\}/);
  assert.match(showcase, /aria-current=\{id === activeTab \? 'page' : undefined\}/);
  assert.match(showcaseStyles, /\.tabs\s*\{/);
  const cssRule = (source, selector) => {
    const start = source.indexOf(selector);
    const end = source.indexOf('}', start + selector.length);
    assert.ok(start >= 0 && end > start, `Missing CSS Rule: ${selector}`);
    return source.slice(start, end + 1);
  };
  const diamondTab = cssRule(showcaseStyles, '.diamonds .tab {');
  assert.doesNotMatch(diamondTab, /url\(|\.png|\.webp/);
  assert.doesNotMatch(showcaseStyles, /\.tab\s*\{[\s\S]*?navigation\/nav-shell\.(?:png|webp)/);
  for (const label of ['Marketplace', 'Cart', 'Orders', 'Wishlist']) {
    assert.match(commerceNav, new RegExp(`>\\s*${label}\\s*<`));
  }
  assert.doesNotMatch(commerceNav, /lucide-react|<(?:Store|ShoppingCart|ReceiptText|Heart)\b/);
  assert.doesNotMatch(commerceNav, /target\s*=\s*["']_blank["']/);
  assert.match(commerceNav, /variant = 'default'/);
  assert.match(commerceNav, /variant === 'pageFooter'/);
  assert.match(commerceNav, /data-marketplace-page-footer=/);
  assert.match(commerceNav, /data-footer-layout=/);
  assert.match(commerceNavStyles, /\.pageFooter\s*\{/);
  assert.match(commerceNavStyles, /\.pageFooter \.link\s*\{/);
  assert.match(cssRule(commerceNavStyles, '.link {'), /shark-panel\/button-secondary\.png/);
  assert.doesNotMatch(cssRule(commerceNavStyles, '.pageFooter .link {'), /url\(|\.png|\.webp/);
  assert.doesNotMatch(commerceNavStyles, /navigation\/nav-shell|shark-panel\/bay/);
  assert.doesNotMatch(commerceNavStyles, /:hover/);
  assert.doesNotMatch(
    [component, styles, index, showcase, showcaseStyles].join('\n'),
    /MarketplaceConsoleSelectorGrid|MARKETPLACE_SELECTOR_ART|selectorControl|selectorGrid|selectorNavigation/
  );
});

test('rejected selector and VIP replacement assets are absent', async () => {
  const manifest = JSON.parse(await read(paths.manifest));
  const vipPlans = manifest.assets.filter((asset) => asset.family === 'vip-plan');

  assert.equal(
    manifest.assets.some((asset) => asset.family === 'destination-selector'),
    false
  );
  assert.equal(vipPlans.length, 0);
  assert.doesNotMatch(
    JSON.stringify(manifest),
    /destination-selector|\/selectors\/|vip-plan|\/vip-plans\//i
  );
  for (const rejectedFile of rejectedSelectorFiles) {
    await assert.rejects(access(rejectedFile));
  }
  for (const rejectedFile of rejectedVipReplacementFiles) {
    await assert.rejects(access(rejectedFile));
  }
  await assert.rejects(access(rejectedRewardAtlas));
});

test('the written contract requires in-place upgrades without cloned page layouts', async () => {
  const readme = await read(paths.readme);
  assert.match(readme, /Preserve each Marketplace page's existing layout/);
  assert.match(readme, /instead\s+of adding standalone destination objects/);
  assert.match(readme, /without making\s+every page a one-to-one clone/);
});

test('VIP choices retain the approved gold art with refined live text and no icon overlay', async () => {
  const cards = await read(paths.cards);
  const vipSource = cards.slice(
    cards.indexOf('export function VIPCard'),
    cards.indexOf('export function MerchCard')
  );

  assert.match(vipSource, /src="\/images\/vip-card\.webp"/);
  assert.match(vipSource, /className=\{styles\.vipPlanName\}/);
  assert.match(vipSource, /className=\{styles\.vipDiamondPrice\}/);
  assert.match(vipSource, /onClick=\{\(\) => onSelect\(plan\.id\)\}/);
  assert.match(vipSource, /aria-pressed=\{isSelected\}/);
  assert.doesNotMatch(vipSource, /MarketplaceConsoleVipPlanCard|<Gem|<Crown/);
});

test('corrected internal controls remain in the current app surface', async () => {
  const [component, showcase, cards] = await Promise.all([
    read(paths.console),
    read(paths.showcase),
    read(paths.cards),
  ]);
  const source = [component, showcase, cards].join('\n');

  assert.match(showcase, /import Link from 'next\/link'/);
  assert.match(component, /<SameSurfaceLink/);
  assert.doesNotMatch(source, /target\s*=\s*["']_blank["']|window\.open\s*\(/);
});

test('all-throwables storage uses the Club Arena asset while World Hub keeps its local display override', async () => {
  const [shopRules, diamondStore, productArt, packageSource, vercelIgnore] = await Promise.all([
    read(paths.shopRules),
    read(paths.diamondStore),
    read('src/lib/store/clubShopProductArt.js'),
    read(paths.packageJson),
    read(paths.vercelIgnore),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(
    shopRules,
    /const ALL_THROWABLES_IMAGE_URL\s*=\s*['"]\/hub\/club-arena\/images\/marketplace\/throwables\/all-throwables-access-v1\.png['"]/s
  );
  assert.match(
    productArt,
    /'All Throwables Pack \(10\)'\s*:\s*['"]\/images\/marketplace\/throwables\/all-throwables-access-v1\.webp['"]/s
  );
  assert.match(diamondStore, /resolveClubShopProductArt\(item\)/);
  await access(
    path.join(root, 'public/images/marketplace/throwables/all-throwables-access-v1.webp')
  );
  assert.match(packageJson.scripts['test:marketplace'], /tests\/shop-item-rules\.test\.mjs/);
  assert.match(vercelIgnore, /^!\/tests\/shop-item-rules\.test\.mjs$/m);
});

test('Marketplace typography uses loaded font variables without generic display fallbacks', async () => {
  const [source, app] = await Promise.all([
    Promise.all(marketplaceTypographyFiles.map(read)).then((files) => files.join('\n')),
    read(paths.app),
  ]);

  assert.match(source, /var\(--font-roboto-condensed\)/);
  assert.match(source, /var\(--font-inter\)/);
  assert.doesNotMatch(source, /Rajdhani|Michroma|system-ui|-apple-system|Segoe UI/);
  assert.doesNotMatch(source, /IBM Plex Mono|ui-monospace|\bmonospace\b/);
  assert.doesNotMatch(source, /text-transform:\s*uppercase|textTransform:\s*['"]uppercase/i);
  assert.doesNotMatch(source, /font-family:\s*['"]?(?:Roboto Condensed|Inter)['"]?\s*,/i);
  assert.doesNotMatch(source, /font:\s*[^;\n]*\/[0-9.]+\s+['"]?Inter['"]?\s*,/i);
  assert.match(app, /Roboto_Condensed/);
  assert.match(app, /variable: '--font-roboto-condensed'/);
  assert.match(app, /robotoCondensed\.variable/);

  for (const declaration of source.split(';')) {
    if (!/font(?:-family)?\s*:/.test(declaration)) continue;
    if (/Roboto Condensed/.test(declaration)) {
      assert.match(declaration, /var\(--font-roboto-condensed\)/);
    }
  }
});

test('Marketplace copy and wallet errors avoid loose emoji and generic floating glyphs', async () => {
  const [diamondStore, wallet, catalog, cardsCss, diamondStoreCss, cart, wishlist, receipt] =
    await Promise.all([
      read(paths.diamondStore),
      read(paths.wallet),
      read(paths.catalog),
      read(paths.cardsCss),
      read(paths.diamondStoreCss),
      read('pages/hub/diamond-store/cart.js'),
      read('pages/hub/diamond-store/wishlist.js'),
      read('pages/hub/diamond-store/orders/[orderId].js'),
    ]);
  const source = `${diamondStore}\n${wallet}\n${cart}\n${wishlist}\n${receipt}`;

  assert.doesNotMatch(source, /const GEM|\{GEM\}|\\uD83D|&#X26A0|stateGlyph/);
  assert.doesNotMatch(
    source,
    /from ['"]lucide-react['"]|<Gem\b|<CreditCard\b|<Heart\b|<Trash2\b|<ReceiptText\b|<PackageCheck\b/
  );
  assert.doesNotMatch(catalog, /icon:\s*['"][◆♦✓]['"]|[◆♦]/);
  assert.doesNotMatch(catalog, /lucide-react|ICON_MAP|resolveIcon|icon:\s*resolveIcon/);
  assert.doesNotMatch(
    `${cardsCss}\n${diamondStoreCss}`,
    /IBM Plex Mono|ui-monospace|\bmonospace\b/
  );
  assert.match(diamondStore, /1 Diamond = \$0\.01/);
});

test('standard rewards preserve catalog taxonomy without floating icon overlays', async () => {
  const [catalog, rewardsCatalog, diamondStore, commerceNav] = await Promise.all([
    read(paths.catalog),
    read(paths.rewardsCatalog),
    read(paths.diamondStore),
    read(paths.commerceNav),
  ]);

  assert.match(catalog, /icon:\s*r\.icon/);
  assert.doesNotMatch(diamondStore, /MarketplaceRewardIcon|reward\.icon/);
  assert.doesNotMatch(commerceNav, /lucide-react|<Store\b|<ShoppingCart\b|<ReceiptText\b|<Heart\b/);

  const liveRewardCopy = [
    ...rewardsCatalog.matchAll(/(?:description|verifyNote):\s*(?:\n\s*)?(['"])(.*?)\1/gs),
  ].map(([, , copy]) => copy);
  assert.ok(liveRewardCopy.length > 0);
  assert.doesNotMatch(liveRewardCopy.join('\n'), /◆/);
});

test('live Marketplace frames use painted masters and retain no hover-only treatment', async () => {
  const [shellCss, legacyStyles, cart, cartCss, navCss, accountCss] = await Promise.all([
    read(paths.diamondStoreCss),
    read('src/components/diamond-store/diamondStoreStyles.js'),
    read(paths.cart),
    read(paths.cartCss),
    read(paths.commerceNavCss),
    read('pages/hub/diamond-store/marketplace-account-controls.module.css'),
  ]);

  assert.match(shellCss, /\.rewardRow\s*\{[\s\S]*?shark-panel\/bay\.png/);
  assert.match(shellCss, /\.rewardsBoostLayout\s*\{[\s\S]*?shark-panel\/bay\.png/);
  assert.match(
    shellCss,
    /\.clubShopSurface :is\(input, select, textarea\)\s*\{[\s\S]*?button-secondary\.png/
  );
  assert.match(legacyStyles, /const ANGULAR_METAL_PLATE = \{[\s\S]*?shark-panel\/bay\.png/);
  assert.match(legacyStyles, /multiplierItem:\s*\{[\s\S]*?button-secondary\.png/);
  assert.match(legacyStyles, /rarityBadge:\s*\{[\s\S]*?button-secondary\.png/);
  assert.match(cart, /className=\{cartStyles\.cartItemFrame\}/);
  assert.match(cart, /className=\{cartStyles\.summaryFrame\}/);
  // Phase 7 (2026-09-19): the cart line and the summary are restrained chrome,
  // not a three-slice painted housing with two empty aria-hidden slices.
  assert.match(cartCss, /\.cartItemFrame,\s*\.summaryFrame \{[\s\S]*?border: 1px solid #23394a;/);
  assert.match(cartCss, /\.cartItemFrameBody,\s*\.summaryFrameBody \{[\s\S]*?padding: 16px 20px;/);
  assert.doesNotMatch(
    cartCss.replace(/\/\*[\s\S]*?\*\//g, ''),
    /FrameTop|FrameBottom|shark-panel\/(?:top|mid|bottom)\.png/
  );
  assert.doesNotMatch(cart, /shark-panel\/bay\.png|spade-console\/mid\.png/);
  assert.doesNotMatch(`${cartCss}\n${navCss}\n${accountCss}`, /:hover/);
});

test('diamond calls to action use restrained machined controls while toast dismissal keeps its shared art', async () => {
  const [showcaseStyles, toastStyles] = await Promise.all([
    read(paths.showcaseCss),
    read(paths.toastCss),
  ]);

  const starterButton = showcaseStyles.slice(
    showcaseStyles.indexOf('.starterPack button {'),
    showcaseStyles.indexOf('.starterPack button:disabled')
  );
  const packageButton = showcaseStyles.slice(
    showcaseStyles.indexOf('.packageCard button {'),
    showcaseStyles.indexOf('.packageCard button:disabled')
  );

  assert.match(starterButton, /border:/);
  assert.match(starterButton, /background:/);
  assert.match(packageButton, /border:/);
  assert.match(packageButton, /background:/);
  assert.doesNotMatch(`${starterButton}\n${packageButton}`, /url\(|\.png|\.webp/);
  assert.match(toastStyles, /\.dismiss\s*\{[\s\S]*?shark-panel\/button-secondary\.png/);
});

test('Diamond package cards expose a readable commerce hierarchy without ornamental housings', async () => {
  const [showcase, styles, page, app] = await Promise.all([
    read(paths.showcase),
    read(paths.showcaseCss),
    read(paths.diamondStore),
    read(paths.app),
  ]);
  const section = (selector, nextSelector) => {
    const start = styles.indexOf(selector);
    const end = styles.indexOf(nextSelector, start + selector.length);
    assert.ok(start >= 0 && end > start, `Missing Showcase Section: ${selector}`);
    return styles.slice(start, end);
  };

  const sectionBar = section('.sectionBar {', '.sectionBar h2 {');
  const starterPack = section('.starterPack {', '.starterArt {');
  const packageCard = section('.packageCard {', '.packageArt {');
  const packagePhoto = section('.packageArt {', '.packageBody {');

  assert.doesNotMatch(
    `${sectionBar}\n${starterPack}\n${packageCard}`,
    /status\/wallet-row-shell|shark-panel\/bay|navigation\/nav-shell/
  );
  assert.match(packageCard, /border:/);
  assert.match(packageCard, /background:/);
  assert.match(packageCard, /box-shadow:/);
  assert.match(packagePhoto, /diamond-packages-sheet\.webp/);
  assert.match(showcase, /className=\{styles\.starterArt\}[\s\S]*?role="img"/);
  assert.match(showcase, /className=\{styles\.packageArt\}[\s\S]*?role="img"/);
  for (const hook of [
    'data-diamond-package',
    'data-package-media',
    'data-package-quantity',
    'data-package-bonus',
    'data-package-price',
    'data-package-primary-action',
  ]) {
    assert.match(showcase, new RegExp(hook));
  }
  assert.match(
    showcase,
    /className=\{styles\.packageBreakdown\}[\s\S]{0,80}?data-package-bonus/
  );
  assert.match(showcase, /<dt>Base Amount<\/dt>/);
  assert.match(showcase, /<dt>Bonus<\/dt>/);
  assert.match(showcase, /<span>Price<\/span>[\s\S]*?\$\{Number\(pkg\.price/);
  assert.match(showcase, /catalogState === 'database'\s*\?\s*'Buy Package'/);
  assert.match(showcase, /catalogState === 'loading'[\s\S]*?'Verifying\.\.\.'/);
  assert.match(showcase, /`Pricing Unavailable For \$\{marketplaceCopy\(pkg\.name\)\}`/);
  assert.match(showcase, /onClick=\{\(\) => onBuy\(pkg\)\}/);
  assert.doesNotMatch(showcase, /decorativeSlot|ornamentalSlot|emptyPlate/);
  assert.match(showcase, /const starterPackages = packages\.slice\(0, Math\.min\(2, packages\.length\)\)/);
  assert.match(showcase, /const primaryPackages = packages\.slice\(starterPackages\.length\)/);
  assert.match(showcase, /PACKAGE_ART_CLASS_BY_ID\[pkg\.id\] \|\| 'packageFallback'/);
  assert.doesNotMatch(showcase, /packages\.slice\(-6\)/);

  // One commerce footer element, declared once and placed once. Page 1 keeps
  // its accepted position under the Diamond showcase; the sibling tab routes
  // render the same element after their content instead of a mid-page rail.
  assert.match(
    page,
    /const marketplaceCommerceFooter = \(\s*<MarketplaceCommerceNav active="store" variant="pageFooter" \/>\s*\);/
  );
  assert.match(page, /\{activeTab === 'diamonds' && marketplaceCommerceFooter\}/);
  assert.match(page, /\{activeTab !== 'diamonds' && marketplaceCommerceFooter\}/);
  assert.doesNotMatch(page, /variant=\{activeTab === 'diamonds' \? 'pageFooter' : 'default'\}/);
  assert.equal((page.match(/<MarketplaceCommerceNav\b/g) || []).length, 1);
  assert.equal((page.match(/<SmarterStoreShowcase\b/g) || []).length, 1);
  // The fixed illustrated footer is suppressed on every Marketplace store-tab
  // route, not only Page 1. Measured on production before this change: the
  // 132px fixed bar covered all three VIP plan purchase buttons and every
  // Marketplace commerce link, with no clearance on body or main.
  assert.match(
    app,
    /const suppressWorldFooterOnMarketplaceStore =\s*MARKETPLACE_PAGE_OWNED_FOOTER_ROUTES\.has\(resolvedPath\);/
  );
  for (const route of [
    '/hub/diamond-store',
    '/hub/vip-membership',
    '/hub/merch-store',
    '/hub/smarter-rewards',
    '/hub/club-shop',
  ]) {
    assert.ok(
      new RegExp(
        `MARKETPLACE_PAGE_OWNED_FOOTER_ROUTES = new Set\\(\\[[\\s\\S]*?'${route}'[\\s\\S]*?\\]\\)`
      ).test(app),
      `${route} must own its Marketplace footer`
    );
  }
  assert.match(
    app,
    /const routeWorldFooterConfig = isClubArenaRoute \? null : resolveWorldFooter\(resolvedPath\)/
  );
  assert.match(app, /const worldCopyWorldId = routeWorldFooterConfig\?\.id \|\| null/);
  assert.match(app, /const bottomNavConfig = suppressWorldFooterOnMarketplaceStore[\s\S]*?\? null/);
  assert.match(app, /<BottomNavSpacer[\s\S]*?config=\{bottomNavConfig\}/);
  assert.match(app, /<BottomNavBar[\s\S]*?config=\{bottomNavConfig\}/);
  assert.match(app, /showBottomNav && \(/);
  assert.doesNotMatch(styles, /\.packageCard\s*\{[^}]*padding:\s*270px/s);
  assert.doesNotMatch(styles, /\.sectionBar\s*\{[^}]*padding:[^;}]*22%/s);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.starterRail\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test('cart controls keep their accessible commerce wiring inside painted console plates', async () => {
  const [cart, styles] = await Promise.all([read(paths.cart), read(paths.cartCss)]);
  const controlAssets = [
    'public/images/marketplace-console-v1/shark-panel/button-primary.png',
    'public/images/marketplace-console-v1/shark-panel/button-secondary.png',
  ];
  const paymentStart = cart.indexOf('Payment Method Selection');
  const paymentEnd = cart.indexOf('{/* Checkout Button */}', paymentStart);
  const paymentSource = cart.slice(paymentStart, paymentEnd);

  await Promise.all(controlAssets.map((asset) => access(path.join(root, asset))));
  assert.ok(paymentStart >= 0 && paymentEnd > paymentStart);
  assert.match(cart, /import cartStyles from ['"]\.\/cart\.module\.css['"]/);
  const referencedClasses = new Set(
    [...cart.matchAll(/cartStyles\.([A-Za-z0-9_]+)/g)].map(([, className]) => className)
  );
  assert.ok(referencedClasses.size > 0);
  for (const className of referencedClasses) {
    assert.match(styles, new RegExp(`\\.${className}(?:\\b|\\s|,|\\[|:)`));
  }
  assert.match(paymentSource, /role="radiogroup"[\s\S]*?onKeyDown=\{handlePaymentChoiceKeyDown\}/);
  assert.match(
    cart,
    /const handlePaymentChoiceKeyDown = \(event\) => \{[\s\S]*?ArrowLeft[\s\S]*?ArrowRight[\s\S]*?ArrowUp[\s\S]*?ArrowDown[\s\S]*?Home[\s\S]*?End[\s\S]*?querySelectorAll\('\[role="radio"\]:not\(:disabled\)'\)[\s\S]*?choices\[nextIndex\]\.click\(\)[\s\S]*?choices\[nextIndex\]\.focus\(\)/
  );
  assert.match(
    paymentSource,
    /role="radio"[\s\S]*?aria-checked=\{usingDiamonds\}[\s\S]*?tabIndex=\{usingDiamonds \? 0 : -1\}[\s\S]*?onClick=\{\(\) => setPayWithDiamonds\(true\)\}/
  );
  assert.match(
    paymentSource,
    /role="radio"[\s\S]*?aria-checked=\{!usingDiamonds\}[\s\S]*?tabIndex=\{!usingDiamonds \? 0 : -1\}[\s\S]*?onClick=\{\(\) => setPayWithDiamonds\(false\)\}/
  );
  assert.match(
    cart,
    /onClick=\{usingDiamonds \? beginDiamondCheckout : handleCheckout\}[\s\S]*?disabled=\{[\s\S]*?checkingOut \|\| \(!usingDiamonds && !cardGroup\)[\s\S]*?\}[\s\S]*?className=\{cartStyles\.checkoutButton\}/
  );
  assert.match(cart, /onClick=\{clearCart\} className=\{cartStyles\.clearCartButton\}/);
  assert.match(cart, /onClick=\{onRemove\} className=\{cartStyles\.removeButton\}/);
  assert.match(
    cart,
    /aria-label=\{`Decrease Quantity Of \$\{copyName\}`\}[\s\S]*?onClick=\{\(\) => onUpdateQuantity\(quantity - 1\)\}[\s\S]*?className=\{cartStyles\.quantityButton\}/
  );
  assert.match(
    cart,
    /aria-label=\{`Increase Quantity Of \$\{copyName\}`\}[\s\S]*?onClick=\{\(\) => onUpdateQuantity\(quantity \+ 1\)\}[\s\S]*?className=\{cartStyles\.quantityButton\}/
  );
  assert.match(
    cart,
    /href="\/hub\/diamond-store" className=\{cartStyles\.continueShoppingLink\}[\s\S]*?Continue Shopping/
  );
  assert.match(
    cart,
    /href="\/hub\/diamond-store" className=\{cartStyles\.emptyBrowseButton\}[\s\S]*?Browse Store/
  );
  for (const label of [
    'Browse Store',
    'Clear Cart',
    'Payment Method',
    'Pay With Diamonds',
    'Pay With Card',
    'Continue Shopping',
    'Less',
    'More',
    'Remove',
  ]) {
    assert.match(cart, new RegExp(`>\\s*${label}\\s*<`));
  }
  for (const checkoutLabel of [
    'Processing...',
    'Pay With Diamonds',
    'Diamonds',
    'Checkout Diamond Package',
    'Proceed To Checkout',
  ]) {
    assert.match(cart, new RegExp(checkoutLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(styles, /\.paymentChoice\s*\{[\s\S]*?shark-panel\/button-secondary\.png/);
  assert.match(
    styles,
    /\.paymentChoice\[aria-checked='true'\]\s*\{[\s\S]*?shark-panel\/button-primary\.png/
  );
  assert.match(styles, /\.checkoutButton\s*\{[\s\S]*?shark-panel\/button-primary\.png/);
  assert.match(styles, /\.continueShoppingLink\s*\{[\s\S]*?shark-panel\/button-secondary\.png/);
  assert.match(styles, /\.emptyBrowseButton\s*\{[\s\S]*?shark-panel\/button-primary\.png/);
  assert.match(
    styles,
    /\.quantityButton,\s*\.removeButton,\s*\.clearCartButton\s*\{[\s\S]*?shark-panel\/button-secondary\.png/
  );
  assert.match(styles, /\.checkoutButton:disabled\s*\{/);
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /:hover/);
  assert.doesNotMatch(cart, /linear-gradient|radial-gradient|borderRadius:\s*['"]50%/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient|border-radius:\s*50%/);
  assert.doesNotMatch(styles, /navigation\/nav-shell|shark-panel\/bay|wallet-row/);
  assert.doesNotMatch(styles, /\b(?:green|purple|violet|lime|magenta)\b/i);
  assert.doesNotMatch(`${cart}\n${styles}`, /[✓✔☑→←↑↓↗↘➜➡]/);
  assert.doesNotMatch(`${cart}\n${styles}`, /[–—]/);
  assert.doesNotMatch(cart, /target\s*=\s*['"]_blank['"]|window\.open\s*\(/);
});
