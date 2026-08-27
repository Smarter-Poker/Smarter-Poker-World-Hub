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
  const clearIndex = STORE.indexOf('clearCheckoutTransport();', STORE.indexOf("setCheckoutReturn({ status: 'verifying' })"));
  const fetchIndex = STORE.indexOf('/api/store/checkout-status?session_id=', clearIndex);
  assert.ok(clearIndex > -1 && fetchIndex > clearIndex, 'checkout transport must clear before verification fetch');
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
