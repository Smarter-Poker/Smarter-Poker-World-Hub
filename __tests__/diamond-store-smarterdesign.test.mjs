// #SMARTERDESIGN Diamond Store contract (docs/SMARTERDESIGN.md).
//
// Every Diamond Store page and sub page opens on the shared Cashier-style
// StoreImageHeader: a circular chrome seal, the live white title, a masked
// realistic scene and the painted chrome help "?" tucked into the upper-right
// corner. This file pins that header, its art, where it is rendered, and the
// no-hover / no-banned-text-colour rules on the store CSS modules it touched.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

import {
  BANNED_TEXT_COLOUR,
  REJECTED_PAINTED_ART,
  ROUNDED_CORNER,
  offStandardPaint,
  ruleFor,
  withoutComments,
} from './smarterdesign-standard.test.mjs';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const HEADER_JSX = 'src/components/diamond-store/StoreImageHeader.jsx';
const HEADER_CSS = 'src/components/diamond-store/StoreImageHeader.module.css';
const HELP_ICON = '/images/smarterdesign/header-help.webp';

function compileModule(path, resolve) {
  const { outputText } = ts.transpileModule(read(path), {
    fileName: 'component.jsx',
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(resolve, module, module.exports);
  return module.exports;
}

// CSS modules resolve to their own class names so the markup can be read.
const cssModule = new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : String(key)) });
const headerModule = compileModule(HEADER_JSX, (name) => {
  if (name.endsWith('.module.css')) return cssModule;
  if (name === '../smarterdesign/headerHelp') return { SD_HEADER_HELP_ICON: HELP_ICON };
  return require(name);
});

test('StoreImageHeader exists and uses the shared #SMARTERDESIGN header "?"', () => {
  assert.ok(existsSync(join(ROOT, HEADER_JSX)), `${HEADER_JSX} must exist`);
  assert.ok(existsSync(join(ROOT, HEADER_CSS)), `${HEADER_CSS} must exist`);
  assert.ok(existsSync(join(ROOT, `public${HELP_ICON}`)), 'the shared header help art must ship');

  const source = read(HEADER_JSX);
  assert.match(source, /import \{ SD_HEADER_HELP_ICON \} from '\.\.\/smarterdesign\/headerHelp'/);
  assert.match(source, /className="sd-header-help"\s+data-focus-custom=""[\s\S]{0,400}<img src=\{SD_HEADER_HELP_ICON\}/);
  assert.equal(typeof headerModule.StoreHelp, 'function');
  assert.equal(typeof headerModule.default, 'function');

  // The module never grows its own "?" geometry; .sd-header-help owns it.
  const css = read(HEADER_CSS);
  assert.equal(ruleFor(css, '.help'), '', 'no module-local help rule');
  assert.match(css, /\.close:focus-visible[\s\S]*?\{[^}]*outline:\s*2px solid #9ee3ff/);
  // The dialog close is a 44px chrome control too.
  const close = ruleFor(css, '.close');
  assert.match(close, /width:\s*44px/);
  assert.match(close, /height:\s*44px/);
  assert.deepEqual(offStandardPaint(css), []);
});

test('StoreImageHeader renders the art, the live title and an accessible help button', () => {
  const Header = headerModule.default;
  const html = renderToStaticMarkup(
    React.createElement(Header, {
      art: 'store-cart',
      title: 'Your Cart',
      parent: 'Marketplace Checkout',
      titleId: 'cart-title',
      help: { steps: ['Review Your Stack.'], faqs: [{ question: 'Is It Secure?', answer: 'Yes.' }] },
    })
  );
  assert.match(html, /^<header class="sd-masthead header[^"]*" data-header-art="store-cart">/);
  assert.match(html, /src="\/images\/smarterdesign\/headers\/store-cart-scene\.webp"/);
  assert.match(html, /src="\/images\/smarterdesign\/headers\/store-cart-seal\.webp"/);
  assert.match(html, /<h1 id="cart-title" class="title">Your Cart<\/h1>/);
  assert.match(html, /<div class="parent">Marketplace Checkout<\/div>/);

  const button = html.match(/<button[^>]*class="sd-header-help"[^>]*>[\s\S]*?<\/button>/)?.[0] || '';
  assert.ok(button, 'the help trigger must be a real button');
  assert.match(button, /type="button"/);
  assert.match(button, /aria-label="Help For Your Cart"/);
  assert.match(button, /aria-haspopup="dialog"/);
  assert.match(button, /aria-controls="[^"]+"/);
  assert.match(button, new RegExp(`src="${HELP_ICON.replace(/[.]/g, '\\.')}"`));
  assert.match(button, /alt=""/);
  assert.match(button, /data-focus-custom=""/);

  // The help content lives in a labelled native dialog with a named close.
  assert.match(html, /<dialog[^>]*aria-labelledby="[^"]+-heading"/);
  assert.match(html, /<h2 id="[^"]+-heading">Your Cart Help<\/h2>/);
  assert.match(html, /aria-label="Close Help"/);
  assert.match(html, /<p>Review Your Stack\.<\/p>/);
  assert.match(html, /<summary>Is It Secure\?<\/summary>/);

  // Detail pages pass heading="p" so the page keeps a single h1.
  const detail = renderToStaticMarkup(
    React.createElement(Header, { art: 'store-merch', title: 'Royal Circuit Tee', heading: 'p' })
  );
  assert.match(detail, /<p class="title">Royal Circuit Tee<\/p>/);
  assert.doesNotMatch(detail, /<h1/);
  assert.match(detail, /aria-label="Help For Royal Circuit Tee"/);
});

const showcaseSource = read('src/components/diamond-store/SmarterStoreShowcase.jsx');
const sectionArt = [...showcaseSource.matchAll(/^\s{4}art: '([a-z0-9-]+)'/gm)].map(([, art]) => art);
const subpageArt = ['store-cart', 'store-orders', 'store-wishlist', 'store-order-detail'];

test('every SECTION_HEADERS art and every sub page art ships as a seal and scene WebP', () => {
  assert.match(showcaseSource, /export const SECTION_HEADERS = \{/);
  for (const section of ['diamonds', 'vip', 'merch', 'rewards', 'club-shop']) {
    assert.match(showcaseSource, new RegExp(`(?:^|\\n)\\s{2}'?${section}'?: \\{\\s*art: '`));
  }
  assert.deepEqual(sectionArt, ['store-diamonds', 'vip', 'store-merch', 'store-rewards', 'store-club-shop']);
  for (const art of [...sectionArt, ...subpageArt]) {
    for (const part of ['seal', 'scene']) {
      const file = join(ROOT, `public/images/smarterdesign/headers/${art}-${part}.webp`);
      assert.ok(existsSync(file), `${art}-${part}.webp must exist`);
      const bytes = statSync(file).size;
      assert.ok(bytes > 1024 && bytes < 100 * 1024, `${art}-${part}.webp must be real art under 100 KiB`);
      const head = readFileSync(file).subarray(0, 12).toString('latin1');
      assert.equal(`${head.slice(0, 4)}${head.slice(8, 12)}`, 'RIFFWEBP', `${art}-${part} must be WebP`);
    }
  }
});

test('the store page, sub page shell and detail experience all render StoreImageHeader', () => {
  const store = read('pages/hub/diamond-store.js');
  assert.match(store, /import SmarterStoreShowcase, \{ SECTION_HEADERS \} from/);
  assert.match(store, /<SmarterStoreShowcase/);
  assert.match(showcaseSource, /import StoreImageHeader from '\.\/StoreImageHeader'/);
  assert.match(showcaseSource, /<StoreImageHeader art=\{header\.art\} title=\{header\.title\} help=\{header\.help\} \/>/);
  assert.match(showcaseSource, /const header = SECTION_HEADERS\[activeTab\] \|\| SECTION_HEADERS\.diamonds/);
  // The old painted hero markup is gone.
  assert.doesNotMatch(showcaseSource, /styles\.(?:hero|heroCopy|diamondHero|sectionHero)\b/);

  const shell = read('src/components/store/MarketplaceSubpageShell.jsx');
  assert.match(shell, /import StoreImageHeader from '\.\.\/diamond-store\/StoreImageHeader'/);
  assert.match(shell, /<StoreImageHeader\s+art=\{headerArt\}/);
  for (const [page, art] of [
    ['pages/hub/diamond-store/cart.js', 'store-cart'],
    ['pages/hub/diamond-store/orders.js', 'store-orders'],
    ['pages/hub/diamond-store/wishlist.js', 'store-wishlist'],
  ]) {
    assert.match(read(page), new RegExp(`<MarketplaceSubpageShell[\\s\\S]*?art="${art}"`), page);
  }

  const detail = read('src/components/store/MarketplaceDetailExperience.jsx');
  assert.match(detail, /import StoreImageHeader from '\.\.\/diamond-store\/StoreImageHeader'/);
  assert.match(detail, /<StoreImageHeader heading="p"[^>]*\{\.\.\.header\}/);
  for (const [page, art] of [
    ['pages/hub/merch-store/[productId].js', 'store-merch'],
    ['pages/hub/club-shop/[itemId].js', 'store-club-shop'],
    ['pages/hub/smarter-rewards/[rewardId].js', 'store-rewards'],
    ['pages/hub/diamond-store/orders/[orderId].js', 'store-order-detail'],
  ]) {
    const source = read(page);
    assert.match(source, /<MarketplaceDetailExperience/, page);
    assert.match(source, new RegExp(`header=\\{\\{\\s*art: '${art}',\\s*title:`), page);
  }
});

test('the VIP masthead uses the same shared header "?"', () => {
  const vipKit = read('src/components/vip/VipKit.jsx');
  assert.match(vipKit, /className="sd-header-help" data-focus-custom=""[\s\S]{0,300}<img src=\{SD_HEADER_HELP_ICON\}/);
});

const touchedStoreCss = [
  'src/components/diamond-store/StoreImageHeader.module.css',
  'src/components/diamond-store/SmarterStoreShowcase.module.css',
  'src/components/diamond-store/DiamondStoreShell.module.css',
  'src/components/diamond-store/CheckoutStatusPanel.module.css',
  'src/components/store/MarketplaceCommerceNav.module.css',
  'src/components/store/MarketplaceDetailExperience.module.css',
  'src/components/store/MarketplaceSubpageShell.module.css',
  'src/components/store/MerchPurchaseDialog.module.css',
  'src/components/store/MerchStore.module.css',
  'src/components/store/RewardTelemetryConsole.module.css',
  'src/components/store/ShoppingCart.module.css',
  'src/components/store/StoreToast.module.css',
  'pages/hub/diamond-store/cart.module.css',
  'pages/hub/diamond-store/marketplace-account-controls.module.css',
];

test('the touched store CSS modules carry no hover states and no banned text colours', () => {
  for (const file of touchedStoreCss) {
    const css = withoutComments(read(file));
    assert.doesNotMatch(css, /:hover/, `${file} must not use :hover`);
    assert.doesNotMatch(css, BANNED_TEXT_COLOUR, `${file} paints gold/amber/yellow/purple/pink text`);
    assert.doesNotMatch(css, /border-left(?:-[a-z]+)?\s*:/, `${file} must not draw accent bars`);
    assert.doesNotMatch(css, REJECTED_PAINTED_ART, `${file} carries rejected painted art`);
    assert.doesNotMatch(css, ROUNDED_CORNER, `${file} must keep square corners (seals excepted)`);
    assert.doesNotMatch(css, /clip-path:\s*(?!none)[a-z]/, `${file} must not clip angular shapes`);
    assert.deepEqual(offStandardPaint(css), [], file);
  }
});
