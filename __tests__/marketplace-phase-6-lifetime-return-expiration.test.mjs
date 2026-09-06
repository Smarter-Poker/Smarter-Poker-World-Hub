import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

test('Lifetime VIP checkout status binds the record to the purchase, owner, and Stripe session', async () => {
  const source = await read('pages/api/store/checkout-status.js');
  const start = source.indexOf("if (type === 'vip_lifetime'");
  const end = source.indexOf("if (session.mode === 'subscription')", start);
  assert.ok(start > -1 && end > start, 'Lifetime VIP status branch must exist before subscription lookup');

  const branch = source.slice(start, end);
  assert.match(branch, /\.from\('vip_lifetime_purchases'\)/);
  assert.match(branch, /\.eq\('id', session\.metadata\.purchase_id\)/);
  assert.match(branch, /\.eq\('user_id', userId\)/);
  assert.match(branch, /\.eq\('stripe_checkout_session_id', session\.id\)/);
  assert.match(branch, /\.maybeSingle\(\)/);
  assert.match(branch, /if \(error\) throw error/);
  assert.match(branch, /orderSource: 'vip'/);
  assert.match(branch, /label: 'Lifetime VIP Membership'/);
  assert.match(branch, /cartItems: \[\]/);
});

test('expired Lifetime VIP checkout marks only its pending purchase failed and keeps the session reference', async () => {
  const source = await read('pages/api/store/webhooks/stripe.js');
  const helperStart = source.indexOf('async function closeExpiredPendingRow');
  const handlerStart = source.indexOf('async function handleCheckoutExpired(session)');
  const handlerEnd = source.indexOf('async function handleSubscriptionUpdate', handlerStart);
  assert.ok(helperStart > -1 && handlerStart > helperStart && handlerEnd > handlerStart,
    'session-matched expiration helper and handler must exist');

  const helper = source.slice(helperStart, handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  const start = handler.indexOf("if (metadata.type === 'vip_lifetime'");
  assert.ok(start > -1, 'expired checkout handler must cover Lifetime VIP');
  const branch = handler.slice(start);
  assert.match(branch, /metadata\.purchase_id/);
  assert.match(branch, /table: 'vip_lifetime_purchases'/);
  assert.match(branch, /status: 'failed'/);
  assert.match(branch, /sessionId: session\.id/);
  assert.match(helper, /\.eq\('status', 'pending'\)/);
  assert.match(helper, /\.eq\('stripe_checkout_session_id', sessionId\)/);
  assert.match(helper, /\.is\('stripe_checkout_session_id', null\)/);
  assert.match(helper, /already terminal, missing, or linked to another session/);
});

test('the webhook rejects oversized or unverifiable payloads without echoing Stripe errors', async () => {
  const source = await read('pages/api/store/webhooks/stripe.js');
  assert.match(source, /MAX_STRIPE_WEBHOOK_BODY_BYTES = 1024 \* 1024/);
  assert.match(source, /bytes > MAX_STRIPE_WEBHOOK_BODY_BYTES/);
  assert.match(source, /status\(413\)\.json\(\{ error: 'Webhook payload too large' \}\)/);
  assert.match(source, /status\(400\)\.json\(\{ error: 'Invalid webhook signature' \}\)/);
  assert.doesNotMatch(source, /Webhook Error: \$\{err\.message\}/);
});
