import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const STORE = readFileSync(join(ROOT, 'pages/hub/diamond-store.js'), 'utf8');
const SHOWCASE = readFileSync(
  join(ROOT, 'src/components/diamond-store/SmarterStoreShowcase.jsx'),
  'utf8'
);
const SHOWCASE_CSS = readFileSync(
  join(ROOT, 'src/components/diamond-store/SmarterStoreShowcase.module.css'),
  'utf8'
);
const CHECKOUT = readFileSync(
  join(ROOT, 'pages/api/store/create-checkout-session.js'),
  'utf8'
);

test('cinematic artwork ships in high-quality WebP with PNG fallbacks', () => {
  const assets = [
    'diamond-vault-hero',
    'diamond-packages-sheet',
  ];
  let pngBytes = 0;
  let webpBytes = 0;

  for (const asset of assets) {
    pngBytes += statSync(join(ROOT, `public/images/store-v3/${asset}.png`)).size;
    webpBytes += statSync(join(ROOT, `public/images/store-v3/${asset}.webp`)).size;
    assert.match(SHOWCASE_CSS, new RegExp(`${asset}\\.webp`));
    assert.match(SHOWCASE_CSS, new RegExp(`${asset}\\.png`));
  }

  assert.match(SHOWCASE_CSS, /image-set\(/);
  assert.ok(webpBytes < pngBytes * 0.2, 'optimized artwork must stay below 20% of PNG payload');

  const routeHeroes = ['vip-hero', 'merch-hero', 'rewards-hero', 'club-shop-hero'];
  for (const asset of routeHeroes) {
    const bytes = statSync(join(ROOT, `public/images/store-v3/${asset}.webp`)).size;
    assert.match(SHOWCASE_CSS, new RegExp(`${asset}\\.webp`));
    assert.ok(bytes < 100 * 1024, `${asset} must stay below 100 KiB`);
  }
});

test('hidden legacy image maps and their stale assets stay removed', () => {
  assert.doesNotMatch(
    STORE,
    /legacy-store-header|legacy-diamond-store|activateOnKey|new-diamond-store\.jpg|store-header-(vip|merch|rewards|arena)\.png/
  );
  assert.doesNotMatch(
    STORE,
    /<ShoppingCart|handleCheckout|handlePayWithDiamonds/,
    'the disconnected floating cart obscures mobile content and no longer owns a purchase path'
  );
});

test('the global header remains outside the redesigned store surface', () => {
  const headerIndex = STORE.indexOf('<UniversalHeader pageDepth={1} />');
  const mainIndex = STORE.indexOf('<main className={`store-redesign-content');
  assert.ok(headerIndex > -1, 'global header is missing');
  assert.ok(mainIndex > headerIndex, 'store styling must not wrap or alter the global header');
});

test('dialogs lock mobile body scroll and restore it on cleanup', () => {
  assert.match(STORE, /import \{ acquireScrollLock \} from/);
  assert.match(STORE, /const releaseScrollLock = acquireScrollLock\('DiamondStoreDialog'\)/);
  assert.match(STORE, /removeEventListener\('keydown', handleKeyDown\);\s*releaseScrollLock\(\)/);
});

test('rewards tabs implement roving focus and standard keyboard navigation', () => {
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.match(STORE, new RegExp(`event\\.key === '${key}'`));
  }
  for (const tab of ['overview', 'diamonds', 'eggs']) {
    assert.match(STORE, new RegExp(`tabIndex=\\{rewardsSubTab === '${tab}' \\? 0 : -1\\}`));
    assert.match(
      STORE,
      new RegExp(`onKeyDown=\\{\\(event\\) => handleRewardsTabKeyDown\\(event, '${tab}'\\)\\}`)
    );
  }
});

test('diamond checkout closes the rapid double-tap window and reports progress', () => {
  assert.match(STORE, /const processingRef = useRef\(false\)/);
  assert.match(STORE, /if \(processingRef\.current\) return;/);
  assert.match(STORE, /setBusyPackageId\(pkg\.id\);\s*setStoreProcessing\(true\)/);
  assert.match(STORE, /busyPackageId=\{busyPackageId\}/);
  assert.match(SHOWCASE, /disabled=\{isProcessing \|\| catalogState !== 'database'\}/);
  assert.match(SHOWCASE, /aria-busy=\{busyPackageId === pkg\.id\}/);
  assert.match(SHOWCASE, /Opening Checkout\.\.\./);
});

test('checkout redirects require an exact origin and return to the right store', () => {
  assert.match(CHECKOUT, /candidate\.origin !== allowedOrigin/);
  assert.doesNotMatch(CHECKOUT, /successUrl\.startsWith\(baseUrl\)|cancelUrl\.startsWith\(baseUrl\)/);
  assert.match(CHECKOUT, /type === 'subscription'[\s\S]*?'\/hub\/vip-membership'/);
  assert.match(CHECKOUT, /type === 'merchandise'[\s\S]*?'\/hub\/merch-store'/);
  assert.match(CHECKOUT, /'\/hub\/diamond-store'/);
  assert.match(CHECKOUT, /\{CHECKOUT_SESSION_ID\}/);
});

test('checkout redirect validation rejects same-prefix foreign origins', () => {
  const source = CHECKOUT.match(
    /function resolveCheckoutRedirect\(rawUrl, baseUrl, fallbackPath\) \{[\s\S]*?\n\}/
  );
  assert.ok(source, 'redirect validator source is missing');
  const resolveCheckoutRedirect = vm.runInNewContext(
    `${source[0]}; resolveCheckoutRedirect`,
    { URL }
  );
  const fallback = '/hub/diamond-store?success=true&session_id={CHECKOUT_SESSION_ID}';

  assert.equal(
    resolveCheckoutRedirect(
      'https://smarter.poker.attacker.example/steal',
      'https://smarter.poker',
      fallback
    ),
    `https://smarter.poker${fallback}`
  );
  assert.equal(
    resolveCheckoutRedirect(
      'https://smarter.poker/hub/vip-membership?session_id={CHECKOUT_SESSION_ID}',
      'https://smarter.poker',
      fallback
    ),
    'https://smarter.poker/hub/vip-membership?session_id={CHECKOUT_SESSION_ID}'
  );
});
