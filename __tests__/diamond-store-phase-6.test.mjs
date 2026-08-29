import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const STORE = read('pages/hub/diamond-store.js');
const MERCH = read('src/components/store/MerchStore.jsx');
const DIALOG = read('src/components/store/MerchPurchaseDialog.jsx');
const DIALOG_CSS = read('src/components/store/MerchPurchaseDialog.module.css');
const STATUS_PANEL = read('src/components/diamond-store/CheckoutStatusPanel.jsx');
const SHOWCASE = read('src/components/diamond-store/SmarterStoreShowcase.jsx');
const SHELL_CSS = read('src/components/diamond-store/DiamondStoreShell.module.css');
const CLUB_PURCHASE = read('pages/api/club-arena/marketplace-purchase.js');
const MERCH_PURCHASE = read('pages/api/store/purchase-with-diamonds.js');
const TOAST = read('src/components/store/StoreToast.jsx');

test('merch diamond purchases use a branded accessible confirmation instead of window.confirm', () => {
  assert.doesNotMatch(MERCH, /window\.confirm/);
  assert.match(MERCH, /<MerchPurchaseDialog/);
  assert.match(MERCH, /setPendingDiamondPurchase/);
  assert.match(MERCH, /diamond_purchase_reviewed/);
  assert.match(MERCH, /diamond_purchase_started/);
  assert.match(DIALOG, /role="dialog"/);
  assert.match(DIALOG, /aria-modal="true"/);
  assert.match(DIALOG, /acquireScrollLock\('MerchPurchaseDialog'\)/);
  assert.match(DIALOG, /event\.key === 'Escape'/);
  assert.match(DIALOG, /event\.key !== 'Tab'/);
  assert.match(DIALOG, /onCancelRef\.current\(\)/);
  assert.doesNotMatch(DIALOG, /\[purchase, onCancel\]/);
  assert.match(DIALOG, /aria-busy=\{busy\}/);
  assert.match(DIALOG_CSS, /border-radius:\s*0/);
  assert.match(DIALOG_CSS, /@media \(prefers-reduced-motion: reduce\)/);
});

test('catalog refreshes abort cleanly when the merch surface unmounts or retries', () => {
  assert.match(MERCH, /const controller = new AbortController\(\)/);
  assert.match(MERCH, /signal: controller\.signal/);
  assert.match(MERCH, /err\?\.name === 'AbortError'/);
  assert.match(MERCH, /controller\.abort\(\)/);
});

test('checkout return verification retries slow fulfillment and cancels stale requests', () => {
  assert.match(STORE, /CHECKOUT_STATUS_RETRY_DELAYS = \[0, 1200, 2400, 4800\]/);
  assert.match(STORE, /new AbortController\(\)/);
  assert.match(STORE, /signal: controller\.signal/);
  assert.match(STORE, /verification_attempts: attempt \+ 1/);
  assert.match(STORE, /controller\.abort\(\)/);
  const clearIndex = STORE.indexOf(
    'clearCheckoutTransport();',
    STORE.indexOf("setCheckoutReturn({ status: 'verifying' })")
  );
  const fetchIndex = STORE.indexOf('/api/store/checkout-status?session_id=', clearIndex);
  assert.ok(
    clearIndex > -1 && fetchIndex > clearIndex,
    'checkout transport must clear before verification fetch'
  );
});

test('checkout status is visible before the catalog and receives focus when it changes', () => {
  const panelIndex = STORE.indexOf('<CheckoutStatusPanel');
  const showcaseIndex = STORE.indexOf('<SmarterStoreShowcase');
  assert.ok(panelIndex > -1 && panelIndex < showcaseIndex);
  assert.match(STATUS_PANEL, /requestAnimationFrame/);
  assert.match(STATUS_PANEL, /focus\(\{ preventScroll: false \}\)/);
  assert.match(STATUS_PANEL, /tabIndex=\{-1\}/);
});

test('mobile purchase rails are labelled, focusable, and keyboard scrollable', () => {
  assert.match(SHOWCASE, /aria-label="Diamond Packages"/);
  assert.match(SHOWCASE, /tabIndex=\{0\}/);
  assert.match(SHOWCASE, /\['ArrowLeft', 'ArrowRight'\]/);
  assert.match(SHOWCASE, /scrollBy\(/);
  assert.match(STORE, /aria-label="VIP Membership Plans"/);
  assert.match(STORE, /className=\{shellStyles\.planRail\}[\s\S]{0,180}tabIndex=\{0\}/);
});

test('VIP headings no longer skip level two and store corners stay sharp without touching the header', () => {
  assert.match(STORE, /<h2 style=\{styles\.benefitsTitle\}>Everything Included With VIP<\/h2>/);
  assert.doesNotMatch(STORE, /<h3 style=\{styles\.benefitsTitle\}>/);
  assert.match(SHELL_CSS, /\.root :is\(article, button, a\[href\]/);
  assert.match(SHELL_CSS, /border-radius:\s*0 !important/);
  assert.doesNotMatch(SHELL_CSS, /UniversalHeader|universal-header|header-left|header-right/);
});

test('wide merchandise purchase controls preserve an accessibility-safe height', () => {
  const purchaseArea = MERCH.slice(
    MERCH.indexOf('{/* Purchase buttons */}'),
    MERCH.indexOf('{/* Honest, specific reason instead of a silently dead button */}')
  );
  assert.equal((purchaseArea.match(/minHeight:\s*46/g) || []).length, 2);
  const fallbackArea = MERCH.slice(
    MERCH.indexOf('{usingFallback && loadError && ('),
    MERCH.indexOf('{loading && (')
  );
  assert.match(fallbackArea, /minHeight:\s*46/);
});

test('authenticated Club Shop controls preserve the 44-pixel target at every viewport', () => {
  assert.match(STORE, /className=\{shellStyles\.clubShopSurface\}/);
  assert.match(
    SHELL_CSS,
    /\.clubShopSurface :is\(button, \[role='button'\]\) \{[\s\S]*?min-height:\s*44px;/
  );
});

test('live merchandise variants keep their labels, prices, stock, and selection after hydration', () => {
  assert.match(
    MERCH,
    /const composedLabel = \[color, size\]\.filter\(Boolean\)\.join\('\s*\/\s*'\)/
  );
  assert.match(MERCH, /priceUsd,[\s\S]*?priceDiamonds,[\s\S]*?stock,[\s\S]*?inStock/);
  assert.match(MERCH, /const defaultVariant = product\.variants\.find\(\(?v\)? => v\.inStock\)/);
  assert.match(
    MERCH,
    /const variant = product\.variants\.find\(\(?v\)? => v\.key === variantKey\) \|\| defaultVariant/
  );
  assert.match(MERCH, /variant\?\.priceUsd, product\.priceUsd/);
  assert.match(MERCH, /variant\?\.priceDiamonds,[\s\S]*?product\.priceDiamonds/);
  assert.match(MERCH, /product\.source !== 'catalog'/);
  assert.match(MERCH, /Options Temporarily Unavailable/);
});

test('store purchase controls close synchronous double-submit gaps', () => {
  assert.match(MERCH, /const busyRef = useRef\(false\)/);
  assert.match(MERCH, /if \(busyRef\.current\) return/);
  assert.match(STORE, /const clubShopProcessingRef = useRef\(false\)/);
  assert.match(
    STORE,
    /if \(!purchaseTarget \|\| !targetClubId \|\| clubShopProcessingRef\.current\) return/
  );
  assert.match(STORE, /purchaseRequestId: createCheckoutRequestId/);
  assert.match(STORE, /const idempotencyKey = purchaseTarget\.purchaseRequestId/);
});

test('physical merch and Club Shop items expose both card and diamond purchase paths', () => {
  assert.match(DIALOG, /Shipping Destination/);
  assert.match(MERCH, /requiresShipping/);
  assert.match(MERCH_PURCHASE, /normalizePrintfulRecipient/);
  assert.match(MERCH_PURCHASE, /createPrintfulOrder/);
  assert.match(STORE, /handleClubCardCheckout/);
  assert.match(STORE, /smarter_poker_pending_club_card_purchase/);
  assert.match(STORE, /<CreditCard size=\{12\}/);
});

test('Club Shop currency, ownership, refresh, failure, and stock rollback match the API contract', () => {
  assert.match(STORE, /Spend Diamonds On Time Banks/);
  assert.match(STORE, /Price In Diamonds/);
  assert.match(STORE, /clubDiamondBalance/);
  assert.match(STORE, /listenBroadcast\('smarter_poker_diamond_sync'/);
  assert.match(STORE, /\.filter\(\(purchase\) => !purchase\.refunded_at\)/);
  assert.match(
    STORE,
    /item\.stackable[\s\S]*?purchaseLimit > 0 && purchasedCount >= purchaseLimit/
  );
  assert.match(STORE, /Retry Club Shop/);
  const claimIndex = CLUB_PURCHASE.indexOf('stockClaimed = avail.stock_claimed === true');
  const balanceIndex = CLUB_PURCHASE.indexOf('if (balance < price)');
  const releaseIndex = CLUB_PURCHASE.indexOf('await releaseStock();', balanceIndex);
  assert.ok(claimIndex > -1 && claimIndex < balanceIndex && releaseIndex > balanceIndex);
});

test('diamond merch returns the locked RPC balance and verifies refund business results', () => {
  assert.match(MERCH_PURCHASE, /typeof deductResult\?\.new_balance === 'number'/);
  assert.match(MERCH_PURCHASE, /data: refundResult, error: refundErr/);
  assert.match(MERCH_PURCHASE, /refundResult && refundResult\.success === false/);
});

test('store feedback and dialogs remain accessible under failure and reverse-tab navigation', () => {
  assert.match(TOAST, /role=\{toast\.type === 'error' \? 'alert' : 'status'\}/);
  assert.match(TOAST, /aria-live=\{toast\.type === 'error' \? 'assertive' : 'polite'\}/);
  assert.match(TOAST, /aria-label="Dismiss Store Message"/);
  assert.match(TOAST, /type === 'error' \|\| type === 'warning' \? 8000 : 4500/);
  assert.match(STORE, /document\.activeElement === first \|\| document\.activeElement === dialog/);
  assert.match(DIALOG, /document\.activeElement === first \|\| document\.activeElement === dialog/);
});

test('store metadata and content render without a client-only transition boundary', () => {
  assert.match(
    STORE,
    /import PageTransition from '..\/..\/src\/components\/transitions\/PageTransition'/
  );
  assert.match(
    STORE,
    /<Head>[\s\S]*?<StoreToast \/>[\s\S]*?<PageTransition disableInitialAnimation>/
  );
  assert.doesNotMatch(STORE, /<meta name="viewport"/);
});
