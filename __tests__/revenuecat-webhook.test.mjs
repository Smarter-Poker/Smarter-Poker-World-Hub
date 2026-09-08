/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The RevenueCat webhook (Club Arena app billing) refuses what it should and
 *  hands the database exactly one shaped event (2026-09-08)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The money decisions are in public.fn_iap_settle_event and were probed in a
 * rolled-back transaction against production (Club Arena changelog
 * 2026-09-08-in-app-purchases.md). What this file pins is the HTTP half:
 * no secret means refuse (503, never "accept everything"), a wrong secret is
 * 401, a malformed body is 400, terminal database answers are 200 so
 * RevenueCat stops retrying, and anything else is 500 so it retries.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handleRevenueCatWebhook, isAuthorized, shapeEvent } = require('../src/lib/store/revenuecatWebhook.js');

const SECRET = 'rc-webhook-secret-0123456789abcdef';
const event = (over = {}) => ({
  api_version: '1.0',
  event: {
    id: 'evt_1', type: 'NON_RENEWING_PURCHASE', app_user_id: '2d1cd6c3-5700-4af9-a271-d4863fdab20d',
    product_id: 'poker.smarter.clubarena.diamonds.micro', transaction_id: 'txn_1',
    original_transaction_id: 'txn_1', store: 'APP_STORE', environment: 'PRODUCTION', price: 1,
    purchased_at_ms: 1757289600000, ...over,
  },
});

test('no configured secret refuses, and never becomes accept-everything', async () => {
  const out = await handleRevenueCatWebhook({ method: 'POST', authorization: SECRET, body: event(), configuredAuth: '', settle: async () => ({ success: true }) });
  assert.equal(out.status, 503);
});

test('a wrong or short secret is 401; the right one, with or without Bearer, is accepted', async () => {
  assert.equal(isAuthorized('nope', SECRET), false);
  assert.equal(isAuthorized(SECRET, 'short'), false);
  assert.equal(isAuthorized(SECRET, SECRET), true);
  assert.equal(isAuthorized(`Bearer ${SECRET}`, SECRET), true);
  const out = await handleRevenueCatWebhook({ method: 'POST', authorization: 'wrong', body: event(), configuredAuth: SECRET, settle: async () => ({ success: true }) });
  assert.equal(out.status, 401);
});

test('GET is 405 and a body without an event is 400', async () => {
  assert.equal((await handleRevenueCatWebhook({ method: 'GET', authorization: SECRET, body: event(), configuredAuth: SECRET, settle: async () => ({}) })).status, 405);
  assert.equal((await handleRevenueCatWebhook({ method: 'POST', authorization: SECRET, body: { hello: 1 }, configuredAuth: SECRET, settle: async () => ({}) })).status, 400);
});

test('the database receives the shaped event, strings only, and a success is 200', async () => {
  let seen = null;
  const out = await handleRevenueCatWebhook({
    method: 'POST', authorization: SECRET, body: event(), configuredAuth: SECRET,
    settle: async (e) => { seen = e; return { success: true, kind: 'diamonds', purchase_id: 'p1' }; },
  });
  assert.equal(out.status, 200);
  assert.equal(out.body.received, true);
  assert.equal(seen.id, 'evt_1');
  assert.equal(seen.type, 'NON_RENEWING_PURCHASE');
  assert.equal(seen.price, '1');
  assert.equal(seen.purchased_at_ms, '1757289600000');
  assert.equal(seen.product_id, 'poker.smarter.clubarena.diamonds.micro');
});

test('terminal database answers are 200 (no retry can change them); others are 500 (retry)', async () => {
  const term = await handleRevenueCatWebhook({ method: 'POST', authorization: SECRET, body: event(), configuredAuth: SECRET, settle: async () => ({ success: false, error: 'unknown_product' }) });
  assert.equal(term.status, 200);
  const retry = await handleRevenueCatWebhook({ method: 'POST', authorization: SECRET, body: event(), configuredAuth: SECRET, settle: async () => ({ success: false, error: 'purchase_not_pending' }) });
  assert.equal(retry.status, 500);
});

test('shapeEvent tolerates missing fields and anonymous ids', () => {
  const s = shapeEvent({ event: { id: 'x', type: 'TEST', app_user_id: '$RCAnonymousID:abc' } });
  assert.equal(s.app_user_id, '$RCAnonymousID:abc');
  assert.equal(s.price, undefined);
  assert.equal(shapeEvent(null), null);
});
