/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PHASE 26: THE TWO REPAIRS PHASE 25 NAMED AND DID NOT MAKE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phase 25 fixed three of the seven `leaveForCheckout` call sites and left the
 * other four, and it took `marketplaceCopy` off the buyer name on every
 * rendered surface but could not take it off the refund toast, because a toast
 * is one string and every toast goes through `marketplaceToastCopy`. Both
 * remainders are closed here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  marketplaceCopy,
  marketplacePreservedName,
  marketplaceToastCopy,
} from '../src/lib/store/marketplaceCopy.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ───────────────────────────────────────────────────────────────────────────
// 1. A checkout that will not open is an error, everywhere
// ───────────────────────────────────────────────────────────────────────────

const CHECKOUT_CALLERS = [
  'pages/hub/diamond-store.js',
  'pages/hub/diamond-store/cart.js',
  'pages/hub/club-shop/[itemId].js',
  'pages/hub/memory-games.js',
  'src/components/store/MerchStore.jsx',
];

test('no caller discards a refusal to open the checkout page', () => {
  for (const path of CHECKOUT_CALLERS) {
    const source = read(path);
    const calls = source.match(/^\s*leaveForCheckout\(/gmu) || [];
    assert.equal(
      calls.length,
      0,
      `${path} calls leaveForCheckout without reading its answer. It returns null when it ` +
        'refuses to navigate, and swallowing that leaves the shopper looking at a redirect ' +
        'toast, a re-enabled button, no redirect, and a durable request still claimed.'
    );
    assert.match(
      source,
      /if \(!leaveForCheckout\(checkoutSession\.url\)\) \{/u,
      `${path} should take the error path when the checkout page will not open.`
    );
  }
});

test('every one of those refusals lands in a catch that can recover the request', () => {
  for (const path of CHECKOUT_CALLERS) {
    const source = read(path);
    assert.match(source, /checkoutRequestReplacementRequired\(/u, path);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 2. A member's name survives the toast formatter
// ───────────────────────────────────────────────────────────────────────────

test('a preserved name is carried through the formatter byte for byte', () => {
  const wrapped = marketplacePreservedName('ALLIN_ACE');
  assert.equal(marketplaceCopy(`Refunded 500 Diamonds To ${wrapped}.`), 'Refunded 500 Diamonds To ALLIN_ACE.');
  assert.equal(
    marketplaceToastCopy('success', `Refunded 500 Diamonds To ${wrapped}.`),
    'Refunded 500 Diamonds To ALLIN_ACE.'
  );
  // Unwrapped is what the defect looked like, and is still the behaviour for
  // prose, which is what this formatter is for.
  assert.equal(marketplaceCopy('Refunded 500 Diamonds To ALLIN_ACE.'), 'Refunded 500 Diamonds To Allin Ace.');
});

test('two members whose names differ only in case stay distinguishable', () => {
  const a = marketplaceToastCopy('success', `To ${marketplacePreservedName('allin_ace')}.`);
  const b = marketplaceToastCopy('success', `To ${marketplacePreservedName('ALLIN_ACE')}.`);
  assert.notEqual(a, b);
  assert.equal(a, 'To allin_ace.');
  assert.equal(b, 'To ALLIN_ACE.');
});

test('the surrounding copy is still formatted, and the markers never print', () => {
  const out = marketplaceCopy(`refunded 500 diamonds to ${marketplacePreservedName('ALLIN_ACE')}.`);
  assert.equal(out, 'Refunded 500 Diamonds To ALLIN_ACE.');
  assert.ok(!/[-]/u.test(out), 'no private-use marker may reach the screen');
});

test('a name cannot smuggle a marker in to free the rest of the message', () => {
  // A closing marker inside the value would otherwise end the protected span
  // early and leave the remainder unformatted.
  const hostile = marketplacePreservedName('x escaped text');
  const out = marketplaceCopy(`a ${hostile} b`);
  assert.ok(!/[-]/u.test(out));
  assert.match(out, /^A /u);
  assert.match(out, / B$/u);
});

test('an empty or missing name preserves nothing, so the caller can fall back', () => {
  assert.equal(marketplacePreservedName(''), '');
  assert.equal(marketplacePreservedName('   '), '');
  assert.equal(marketplacePreservedName(null), '');
  assert.equal(marketplacePreservedName(undefined), '');
});

test('the refund toast names the member as they are recorded', () => {
  const ledger = read('src/components/store/ClubShopPurchaseLedger.jsx');
  assert.match(ledger, /marketplacePreservedName\(row\.buyerName\) \|\| 'Member'/u);
  assert.match(ledger, /import \{[^}]*marketplacePreservedName[^}]*\} from/u);
});
