import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
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
  const handlerEnd = source.indexOf('function stripeObjectId', handlerStart);
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

test('an oversized webhook keeps stream errors handled until the request closes', async () => {
  const source = await read('pages/api/store/webhooks/stripe.js');
  const start = source.indexOf('async function getRawBody(req)');
  const end = source.indexOf('\n\nlet _supabase', start);
  assert.ok(start > -1 && end > start, 'raw body reader must remain independently testable');
  const getRawBody = new Function(
    'Buffer',
    `const MAX_STRIPE_WEBHOOK_BODY_BYTES = 1024 * 1024;\n${source.slice(start, end)}\nreturn getRawBody;`
  )(Buffer);

  class RequestStream extends EventEmitter {
    resume() { this.resumed = true; }
  }

  const req = new RequestStream();
  const reading = getRawBody(req);
  req.emit('data', Buffer.alloc((1024 * 1024) + 1));
  await assert.rejects(reading, error => error?.code === 'BODY_TOO_LARGE');
  assert.equal(req.resumed, true, 'the rejected body must be drained');
  assert.ok(req.listenerCount('error') > 0, 'draining must retain an error listener');
  assert.doesNotThrow(() => req.emit('error', new Error('client reset after overflow')));
  req.emit('close');
  assert.equal(req.listenerCount('error'), 0, 'stream listeners must release after close');
});
