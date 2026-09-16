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
  diamondStore: 'pages/hub/diamond-store.js',
  shopRules: 'src/lib/club-arena/shopItemRules.js',
  wallet: 'src/components/store/DiamondWalletModal.jsx',
  walletCss: 'src/components/store/DiamondWalletModal.module.css',
  toastCss: 'src/components/store/StoreToast.module.css',
  packageJson: 'package.json',
  vercelIgnore: '.vercelignore',
  app: 'pages/_app.js',
};

const marketplaceTypographyFiles = [
  paths.consoleCss,
  paths.showcaseCss,
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
  const [component, styles, index, showcase, showcaseStyles] = await Promise.all([
    read(paths.console),
    read(paths.consoleCss),
    read(paths.index),
    read(paths.showcase),
    read(paths.showcaseCss),
  ]);

  assert.match(showcase, /<nav className=\{styles\.tabs\}/);
  assert.match(showcase, /<Link[\s\S]*?href=\{TAB_ROUTES\[id\]\}/);
  assert.match(showcase, /aria-current=\{id === activeTab \? 'page' : undefined\}/);
  assert.match(showcaseStyles, /\.tabs\s*\{/);
  assert.match(showcaseStyles, /\.tab\s*\{[\s\S]*?navigation\/nav-shell\.png/);
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

test('all-throwables art uses the packaged World Hub URL and its rule test ships in CI', async () => {
  const [shopRules, packageSource, vercelIgnore] = await Promise.all([
    read(paths.shopRules),
    read(paths.packageJson),
    read(paths.vercelIgnore),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(
    shopRules,
    /const ALL_THROWABLES_IMAGE_URL\s*=\s*['"]\/images\/marketplace\/throwables\/all-throwables-access-v1\.png['"]/s
  );
  assert.doesNotMatch(shopRules, /\/hub\/club-arena\/images\/marketplace\/throwables/);
  await access(
    path.join(root, 'public/images/marketplace/throwables/all-throwables-access-v1.png')
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
  assert.match(source, /var\(--font-ibm-plex-mono\)/);
  assert.doesNotMatch(source, /Rajdhani|Michroma|system-ui|-apple-system|Segoe UI/);
  assert.doesNotMatch(source, /font-family:\s*['"]?(?:Roboto Condensed|Inter)['"]?\s*,/i);
  assert.doesNotMatch(source, /font:\s*[^;\n]*\/[0-9.]+\s+['"]?Inter['"]?\s*,/i);
  assert.match(app, /Roboto_Condensed/);
  assert.match(app, /variable: '--font-roboto-condensed'/);
  assert.match(app, /robotoCondensed\.variable/);
  assert.match(app, /IBM_Plex_Mono/);
  assert.match(app, /variable: '--font-ibm-plex-mono'/);
  assert.match(app, /ibmPlexMono\.variable/);

  for (const declaration of source.split(';')) {
    if (!/font(?:-family)?\s*:/.test(declaration)) continue;
    if (/Roboto Condensed/.test(declaration)) {
      assert.match(declaration, /var\(--font-roboto-condensed\)/);
    }
    if (/IBM Plex Mono/.test(declaration)) {
      assert.match(declaration, /var\(--font-ibm-plex-mono\)/);
    }
  }
});

test('Marketplace copy and wallet errors avoid loose emoji and generic floating glyphs', async () => {
  const [diamondStore, wallet] = await Promise.all([read(paths.diamondStore), read(paths.wallet)]);
  const source = `${diamondStore}\n${wallet}`;

  assert.doesNotMatch(source, /const GEM|\{GEM\}|\\uD83D|&#X26A0|stateGlyph/);
  assert.match(diamondStore, /1 Diamond = \$0\.01/);
});

test('diamond calls to action and toast dismissal use approved painted control art', async () => {
  const [showcaseStyles, toastStyles] = await Promise.all([
    read(paths.showcaseCss),
    read(paths.toastCss),
  ]);

  assert.match(showcaseStyles, /\.starterPack button\s*\{[\s\S]*?shark-panel\/button-primary\.png/);
  assert.match(showcaseStyles, /\.packageCard button\s*\{[\s\S]*?shark-panel\/button-primary\.png/);
  assert.match(toastStyles, /\.dismiss\s*\{[\s\S]*?shark-panel\/button-secondary\.png/);
});
