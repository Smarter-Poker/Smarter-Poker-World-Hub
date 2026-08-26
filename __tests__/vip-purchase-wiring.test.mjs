/**
 * VIP PAGE — THE PAGE MUST BE ABLE TO SELL VIP
 * ─────────────────────────────────────────────────────────────────────────
 * On 2026-08-26 the live VIP page could not take money. `VIPCard` was
 * imported and never rendered, `handleVIPSubscribe` was defined and never
 * called, `vipSubscribeLabel` was computed and never read. Confirmed against
 * the deployed bundle, not just the source: "subscribe-button.png" and
 * "Subscribe —" both returned 0 occurrences in production. A visitor read 23
 * benefits and 11 FAQ entries and then had no way to become a member.
 *
 * Nothing failed. Unused imports do not break a build, an uncalled handler
 * does not break a build, and no test asserted that the buy button existed.
 * That is the gap this file closes.
 *
 * These are source-level assertions because the decision lives in a
 * 3,000-line client component whose imports reach Supabase and the DOM.
 * What regresses is a render block being dropped again; that is visible here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STORE = readFileSync(join(ROOT, 'pages/hub/diamond-store.js'), 'utf8');
const DATA = readFileSync(join(ROOT, 'src/data/diamondStoreData.js'), 'utf8');

test('the three plans are actually RENDERED, not merely imported', () => {
  for (const plan of ['daily', 'monthly', 'annual']) {
    assert.ok(
      new RegExp(`<VIPCard\\s+plan=\\{VIP_MEMBERSHIP\\.${plan}\\}`).test(STORE),
      `VIP_MEMBERSHIP.${plan} is not rendered as a <VIPCard>`
    );
  }
  assert.ok(/onSelect=\{setSelectedVIP\}/.test(STORE), 'plan cards must be selectable');
});

test('the subscribe control exists and is wired to the handler', () => {
  assert.match(STORE, /onClick=\{handleVIPSubscribe\}/, 'no control calls handleVIPSubscribe');
  assert.match(STORE, /subscribe-button\.png/, 'the subscribe button artwork is not rendered');
  assert.match(STORE, /\{isProcessing \? 'Processing\.\.\.' : vipSubscribeLabel\}/,
    'the plan-aware caption must render — the button image is a static $19.99/month picture');
});

test('handleVIPSubscribe reaches BOTH a diamond path and a Stripe path', () => {
  assert.match(STORE, /const handleVIPSubscribe = async/);
  assert.match(STORE, /await startStripeCheckout\(plan\)/, 'cash plans must reach Stripe');
  assert.match(STORE, /runDailyPassPurchase/, 'the daily pass path must be reachable');
});

test('paying for a membership in diamonds is offered and correctly wired', () => {
  assert.match(STORE, /\/api\/store\/purchase-vip-with-diamonds/,
    'the diamond-purchase endpoint exists server-side and must be called');
  assert.match(STORE, /'x-idempotency-key': idempotencyKey/,
    'a money path must send the idempotency key the API accepts');
  assert.match(STORE, /Pay With Diamonds Instead/, 'the option must be visible to the member');
  // The FAQ promises this. If the button goes, the promise becomes false again.
  assert.ok(/1,999 Diamond Monthly Option/.test(STORE), 'FAQ references the diamond option');
});

test('the diamond cost shown matches the server formula (100 per dollar)', () => {
  const usd = DATA.match(/monthly:\s*\{[\s\S]*?price:\s*([\d.]+)/);
  assert.ok(usd, 'monthly price not found in the catalog');
  assert.equal(Math.round(Number(usd[1]) * 100), 1999, 'monthly must derive to 1,999 diamonds');
  assert.match(STORE, /Math\.round\(Number\(selectedVIPPlan\.price\) \* 100\)/,
    'the client must derive the cost the same way the server does, from the same price');
});

test('an existing member is told so before being invited to pay again', () => {
  assert.match(STORE, /You Are Already A VIP Member/, 'no already-VIP state is rendered');
  assert.match(STORE, /\{isVip && \(/, 'isVip must gate that banner');
  assert.match(STORE, /vipExpiresAt/, 'the expiry must be shown, not just the boolean');
});

test('no native confirm() on a path that spends diamonds', () => {
  const vipRegion = STORE.slice(0, STORE.indexOf('activeTab === \'club-shop\''));
  assert.ok(
    !/if \(confirm\(/.test(vipRegion),
    'window.confirm blocks the tab and is easy to miss in an installed PWA; use the in-page dialog'
  );
  assert.match(STORE, /role="dialog"[\s\S]{0,200}aria-modal="true"/, 'the replacement dialog must exist');
});

test('every image-map hotspot can be activated from a keyboard', () => {
  const hotspots = STORE.match(/<div[\s\S]{0,200}?role="button"[\s\S]{0,900}?\/>/g) || [];
  assert.ok(hotspots.length > 0, 'no hotspots found — did the markup change shape?');
  const inert = hotspots.filter((h) => !h.includes('onKeyDown'));
  assert.equal(
    inert.length,
    0,
    `${inert.length} of ${hotspots.length} hotspots are tabbable but not keyboard-activatable`
  );
});
