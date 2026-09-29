import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('Club Shop card returns verify independently of mutable catalog context', async () => {
  const source = await read('pages/hub/club-shop/[itemId].js');
  assert.match(source, /const checkoutSessionId = Array\.isArray\(router\.query\.session_id\)/);
  assert.match(source, /router\.query\.success !== 'true' \|\| !checkoutSessionId\) return/);
  assert.doesNotMatch(
    source,
    /router\.query\.success !== 'true' \|\| !checkoutSessionId \|\| !clubId/
  );
  assert.match(source, /encodeURIComponent\(checkoutSessionId\)/);
  assert.match(source, /const returnClubId = clubId \|\| requestedClubId/);
  assert.match(source, /clubId=\$\{encodeURIComponent\(returnClubId\)\}/);
  assert.match(source, /receipt\.walletBalance/);
  assert.match(source, /normalizeVerifiedCheckoutStatus\(body, \{/);
  assert.match(source, /accountId: expectedAccountId/);
  assert.doesNotMatch(source, /clubId=\$\{clubId\}.*shallow/);
});

test('Club Shop card completion is explicit and canceled retries settle cleanly', async () => {
  const source = await read('pages/hub/club-shop/[itemId].js');
  assert.match(source, /kind: 'complete'/);
  assert.match(source, /Card Settlement And Inventory Delivery Are Complete/i);
  assert.match(source, /preserveContext: true/);
  assert.match(source, /if \(!preserveContext\) \{\s*setItem\(null\);\s*setClubId\(null\)/);
  assert.match(source, /let wakeRetry = null/);
  assert.match(source, /if \(wakeRetry\) wakeRetry\(\)/);
  assert.match(source, /redemptionStatus === 'needs_review'/);
  assert.match(source, /Do Not Pay By Card Again/i);
});

// Club Arena shows these pages in a sanctioned same-origin frame. Stripe
// Checkout sends X-Frame-Options: DENY and vercel.json sends
// Permissions-Policy: payment=(), so the redirect breaks out to the top window
// through leaveForCheckout. A popup or a _blank target is still not the answer.
test('card checkout breaks out of a frame on Club Shop and merchandise', async () => {
  const [club, merch] = await Promise.all([
    read('pages/hub/club-shop/[itemId].js'),
    read('src/components/store/MerchStore.jsx'),
  ]);
  assert.match(
    club,
    /normalizeVerifiedCheckoutSession\([\s\S]{0,100}body,[\s\S]{0,100}checkoutRequestId,[\s\S]{0,100}offerConfirmation/
  );
  assert.match(
    merch,
    /normalizeVerifiedCheckoutSession\([\s\S]{0,100}data,[\s\S]{0,100}checkoutRequestId,[\s\S]{0,100}offerConfirmation/
  );
  assert.match(club, /leaveForCheckout\(checkoutSession\.url\)/);
  assert.match(merch, /leaveForCheckout\(checkoutSession\.url\)/);
  assert.doesNotMatch(
    `${club}\n${merch}`,
    /window\.location\.assign\(checkoutSession\.url\)/
  );
  assert.doesNotMatch(`${club}\n${merch}`, /window\.open\s*\(/);
  assert.doesNotMatch(`${club}\n${merch}`, /target=["']_blank["']/);
});

test('in-page image inspection locks scroll and exposes expanded state', async () => {
  const source = await read('src/components/store/MarketplaceDetailExperience.jsx');
  assert.match(source, /const mediaDialogId = useId\(\)/);
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(source, /document\.body\.style\.overflow = previousBodyOverflow/);
  assert.match(source, /aria-controls=\{mediaDialogId\}/);
  assert.match(source, /aria-expanded=\{mediaExpanded\}/);
  assert.match(source, /id=\{mediaDialogId\}/);
});

test('Phase 18 contract is shipped in the Vercel marketplace suite', async () => {
  const [pkg, ignore] = await Promise.all([read('package.json'), read('.vercelignore')]);
  assert.match(pkg, /__tests__\/diamond-store-phase-18\.test\.mjs/);
  assert.match(ignore, /!\/__tests__\/diamond-store-phase-18\.test\.mjs/);
});
