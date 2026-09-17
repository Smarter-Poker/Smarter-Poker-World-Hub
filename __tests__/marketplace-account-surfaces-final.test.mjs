import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const CART = read('pages/hub/diamond-store/cart.js');
const CART_CSS = read('pages/hub/diamond-store/cart.module.css');
const ORDERS = read('pages/hub/diamond-store/orders.js');
const RECEIPT = read('pages/hub/diamond-store/orders/[orderId].js');
const WISHLIST = read('pages/hub/diamond-store/wishlist.js');
const FULFILLMENT = read('pages/hub/merch-store/fulfillment.js');
const CHECKOUT_AUTHORIZATION = read('src/lib/store/checkoutAuthorization.js');
const CONSOLE_CSS = read('src/components/marketplace-console/MarketplaceConsole.module.css');

test('cart empty and error states require an owner-matched authoritative read', () => {
  assert.match(CART, /const synchronousAccountId = getAuthUser\(\)\?\.id \|\| null/);
  assert.match(CART, /const expectedCartOwnerId = synchronousAccountId \|\| 'guest'/);
  assert.match(CART, /cartOwnerId === expectedCartOwnerId && hydrated \? cart : \[\]/);
  assert.match(
    CART,
    /cartLoadError\?\.ownerId === expectedCartOwnerId \? cartLoadError\.message : null/
  );
  assert.match(CART, /Your Saved Cart Could Not Be Verified/);
  assert.match(CART, /Your Diamond Balance Could Not Be Verified/);
  assert.match(CART, /Could Not Verify Your Cart/);
  assert.match(CART, /Retry Secure Read/);
});

test('receipt responses remain bound to the active account through every await', () => {
  assert.match(RECEIPT, /const committedAccountId =/);
  assert.match(RECEIPT, /activeAccountIdRef\.current = committedAccountId/);
  assert.match(RECEIPT, /requestAbortRef\.current\?\.abort\(\)/);
  assert.match(RECEIPT, /requestRef\.current === requestId/);
  assert.match(RECEIPT, /getAuthUser\(\)\?\.id === expectedAccountId/);
  assert.match(RECEIPT, /loadedRecord\?\._ownerId === committedAccountId/);
  assert.match(RECEIPT, /_ownerId: expectedAccountId/);
  assert.doesNotMatch(RECEIPT, /_ownerId:\s*user\.id/);
});

test('account states and cart framing use native painted assets at their native families', () => {
  for (const source of [CART, ORDERS, RECEIPT, WISHLIST]) {
    assert.match(source, /MarketplaceConsole(?:Panel|StatusRow)/);
  }

  assert.match(CART_CSS, /\.cartItemFrameTop,[\s\S]*?shark-panel\/top\.png/);
  assert.match(CART_CSS, /\.cartItemFrameBody,[\s\S]*?shark-panel\/mid\.png/);
  assert.match(CART_CSS, /background:[\s\S]*?repeat-y/);
  assert.match(CART_CSS, /\.cartItemFrameBottom,[\s\S]*?shark-panel\/bottom\.png/);
  assert.doesNotMatch(CART, /shark-panel\/bay\.png|spade-console\/mid\.png/);
  assert.match(CONSOLE_CSS, /\.statusRow\s*\{[\s\S]*?status\/wallet-row-shell\.webp/);
  assert.match(CONSOLE_CSS, /\.sharkPanelTop\s*\{[\s\S]*?shark-panel\/top\.png/);
});

test('account surfaces preserve same-tab navigation and banned-style contract', () => {
  const source = [CART, CART_CSS, ORDERS, RECEIPT, WISHLIST].join('\n');
  assert.doesNotMatch(source, /target\s*=\s*['"]_blank['"]|window\.open\s*\(/);
  assert.doesNotMatch(source, /[\u2013\u2014]/u);
  assert.doesNotMatch(source, /:hover/);
  assert.doesNotMatch(source, /(?:linear|radial|repeating-linear)-gradient/);
  assert.doesNotMatch(source, /\b(?:green|lime|purple|violet|magenta)\b/i);
});

test('orders and wishlist never project records from an uncommitted owner', () => {
  assert.match(ORDERS, /ordersOwnerId === committedAccountId \? loadedOrders : \[\]/);
  assert.match(ORDERS, /loading \|\| changingOwner \|\| !committedAccountId/);
  assert.match(ORDERS, /activeAccountIdRef\.current === expectedAccountId/);
  assert.match(ORDERS, /getAuthUser\(\)\?\.id === expectedAccountId/);
  assert.match(WISHLIST, /wishlistOwnerId === committedAccountId \? loadedWishlist : \[\]/);
  assert.match(WISHLIST, /loading \|\| changingOwner \|\| !committedAccountId/);
  assert.match(WISHLIST, /activeAccountIdRef\.current === expectedAccountId/);
  assert.match(WISHLIST, /getAuthUser\(\)\?\.id === expectedAccountId/);
});

test('Marketplace authorization uses the sanctioned fresh-token boundary', () => {
  assert.match(CHECKOUT_AUTHORIZATION, /getAuthUser, getFreshAccessToken/);
  assert.match(CHECKOUT_AUTHORIZATION, /initialUser\?\.id !== expectedAccountId/);
  assert.match(
    CHECKOUT_AUTHORIZATION,
    /await Promise\.race\(\[getFreshAccessToken\(\), deadline\]\)/
  );
  assert.match(CHECKOUT_AUTHORIZATION, /confirmedUser\?\.id !== expectedAccountId/);
  assert.doesNotMatch(CHECKOUT_AUTHORIZATION, /auth\.getSession\s*\(/);

  assert.match(FULFILLMENT, /ensureAuthReady\(supabase\)\.then\(\(user\) =>/);
  assert.doesNotMatch(FULFILLMENT, /auth\.getSession\s*\(/);
});
