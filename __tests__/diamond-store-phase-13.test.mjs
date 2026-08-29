import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const merchDetail = read('pages/hub/merch-store/[productId].js');
const clubDetail = read('pages/hub/club-shop/[itemId].js');
const receipt = read('pages/hub/diamond-store/orders/[orderId].js');
const vipManage = read('pages/hub/vip-membership/manage.js');
const store = read('pages/hub/diamond-store.js');
const detailShell = read('src/components/store/MarketplaceDetailExperience.jsx');
const verifier = read('scripts/verify-marketplace-deployment.mjs');

test('live catalog additions receive an ISR product detail page without a code deployment', () => {
  assert.match(merchDetail, /fallback:\s*['"]blocking['"]/);
  assert.match(merchDetail, /from\(['"]merchandise_items['"]\)/);
  assert.match(merchDetail, /eq\(['"]is_active['"],\s*true\)/);
  assert.match(merchDetail, /revalidate:\s*300/);
  assert.match(merchDetail, /fulfillmentReady/);
  assert.match(merchDetail, /https:\/\/schema\.org\/(?:InStock|OutOfStock)/);
  assert.match(merchDetail, /candidate\.startsWith\(['"]\/['"]\)/);
  assert.match(merchDetail, /url\.protocol === ['"]https:['"]/);
});

test('marketplace JSON-LD cannot terminate its script element', () => {
  assert.match(detailShell, /function serializeStructuredData/);
  assert.match(detailShell, /\\u003c/);
  assert.match(detailShell, /\\u003e/);
  assert.match(detailShell, /\\u0026/);
  assert.match(detailShell, /serializeStructuredData\(structuredData\)/);
});

test('club item detail closes double-submit windows and clears abandoned checkout intent', () => {
  assert.match(clubDetail, /const loadRequestRef = useRef\(0\)/);
  assert.match(clubDetail, /requestId !== loadRequestRef\.current/);
  assert.match(clubDetail, /const processingRef = useRef\(false\)/);
  assert.match(clubDetail, /if \(processingRef\.current\) return/);
  assert.match(clubDetail, /processingRef\.current = true/);
  assert.match(clubDetail, /processingRef\.current = false/);
  assert.match(clubDetail, /removeItem\('smarter_poker_pending_club_detail_card_purchase'\)/);
  assert.match(clubDetail, /Sign In To Buy This Item/);
  assert.match(clubDetail, /Retry Live Inventory/);
  assert.match(clubDetail, /Review Diamond Purchase/);
  assert.match(clubDetail, /Confirm Diamond Purchase/);
  assert.match(clubDetail, /ref=\{diamondReviewTitleRef\}/);
  assert.match(clubDetail, /router\.query\.canceled === ['"]true['"]/);
  assert.match(clubDetail, /Card checkout canceled\. Your diamonds and club inventory were not changed\./);
  assert.match(clubDetail, /Card checkout is unavailable for this item price\./);
  assert.match(clubDetail, /Sign in again before authorizing a diamond purchase\./);
  assert.match(clubDetail, /const diamondReviewTriggerRef = useRef\(null\)/);
});

test('catalog normalization comments describe the deployed defensive contract', () => {
  const merchStore = read('src/components/store/MerchStore.jsx');
  assert.doesNotMatch(merchStore, /owned by another agent|not deployed yet/i);
  assert.match(merchStore, /catalog API and database schema/i);
});

test('VIP management closes synchronous duplicate plan and cancellation requests', () => {
  assert.match(vipManage, /const actionBusyRef = useRef\(false\)/);
  assert.match(vipManage, /if \(actionBusyRef\.current\) return/);
  assert.match(vipManage, /actionBusyRef\.current = true/);
  assert.match(vipManage, /actionBusyRef\.current = false/);
  assert.match(vipManage, /setPendingPlan\(['"]monthly['"]\)/);
  assert.match(vipManage, /setPendingPlan\(['"]annual['"]\)/);
  assert.match(vipManage, /Confirm Plan Switch/);
  assert.match(vipManage, /switchPlan\(pendingPlan\)/);
});

test('VIP FAQ and private receipts point at their now-live management context', () => {
  assert.match(store, /Switch Plans From The VIP Command Center/);
  assert.doesNotMatch(store, /Not Automatically From This Page Yet/);
  assert.match(receipt, /const authReturnPath/);
  assert.match(receipt, /source=\$\{encodeURIComponent\(source\)\}/);
  assert.match(receipt, /useRequireAuth\(authReturnPath\)/);
});

test('deployment verification distinguishes checkout readiness from deferred fulfillment', () => {
  assert.match(verifier, /--require-checkout/);
  assert.match(verifier, /cardCheckout/);
  assert.match(verifier, /diamondCheckout/);
  assert.match(verifier, /automaticMerchFulfillment/);
  assert.match(verifier, /checkout configuration is incomplete/i);
});
