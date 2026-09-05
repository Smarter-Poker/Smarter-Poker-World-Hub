import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const printful = require('../src/lib/store/printfulFulfillment.js');
const ORDER_ID = '3d4f95d1-0aae-49fb-82ca-a984fbd1dd01';

test('Printful cancellation addresses an order idempotently and authenticates server-side', async () => {
  let request;
  const result = await printful.cancelPrintfulOrder({
    orderId: ORDER_ID,
    providerOrderId: 8123,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ result: { id: 8123, status: 'canceled' } }) };
    },
    env: { PRINTFUL_API_TOKEN: 'private-token', PRINTFUL_STORE_ID: '55' },
    apiBase: 'https://printful.invalid',
  });

  assert.equal(request.url, 'https://printful.invalid/orders/8123');
  assert.equal(request.options.method, 'DELETE');
  assert.equal(request.options.headers.Authorization, 'Bearer private-token');
  assert.equal(result.status, 'canceled');
});

test('Printful cancellation treats an already-absent provider order as reconciled', async () => {
  const result = await printful.cancelPrintfulOrder({
    orderId: ORDER_ID,
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'not found' } }),
    }),
    env: { PRINTFUL_API_TOKEN: 'private-token' },
    apiBase: 'https://printful.invalid',
  });
  assert.deepEqual(result, { canceled: true, already_absent: true });
});

test('Printful cancellation surfaces provider failures for retry/review', async () => {
  await assert.rejects(
    printful.cancelPrintfulOrder({
      orderId: ORDER_ID,
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
      env: { PRINTFUL_API_TOKEN: 'private-token' },
      apiBase: 'https://printful.invalid',
    }),
    (error) => error.code === 'PRINTFUL_REQUEST_FAILED' && error.status === 503
  );
});

test('commerce routes require settled payment and handle asynchronous checkout outcomes', async () => {
  const [checkout, webhook] = await Promise.all([
    readFile(new URL('../pages/api/store/create-checkout-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/store/webhooks/stripe.js', import.meta.url), 'utf8'),
  ]);

  assert.match(checkout, /payment_method_types:\s*\['card'\]/);
  assert.match(webhook, /checkout\.session\.async_payment_succeeded/);
  assert.match(webhook, /checkout\.session\.async_payment_failed/);
  assert.match(webhook, /session\.payment_status\s*!==\s*'paid'/);
});

test('refund reconciliation is cumulative and provider-aware', async () => {
  const [webhook, migration] = await Promise.all([
    readFile(new URL('../pages/api/store/webhooks/stripe.js', import.meta.url), 'utf8'),
    readFile(
      new URL('../supabase/migrations/20260829150000_store_commerce_atomicity.sql', import.meta.url),
      'utf8'
    ),
  ]);

  assert.match(webhook, /reconcile_diamond_purchase_refund/);
  assert.match(webhook, /cancelPrintfulOrder/);
  assert.match(webhook, /refunded_amount_cents/);
  assert.match(migration, /refunded_amount_cents/);
  assert.match(migration, /refunded_diamonds/);
  assert.match(migration, /FOR UPDATE/i);
});

test('VIP purchases use one database transaction for debit and entitlement extension', async () => {
  // The daily-pass route was deleted on 2026-09-05 with the Daily Pass itself.
  const [vip, migration] = await Promise.all([
    readFile(new URL('../pages/api/store/purchase-vip-with-diamonds.js', import.meta.url), 'utf8'),
    readFile(
      new URL('../supabase/migrations/20260829150000_store_commerce_atomicity.sql', import.meta.url),
      'utf8'
    ),
  ]);

  assert.match(vip, /purchase_vip_with_diamonds_atomic/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.purchase_vip_with_diamonds_atomic/);
  assert.match(migration, /PERFORM 1\s+FROM public\.profiles[\s\S]*FOR UPDATE/i);
  assert.match(
    migration,
    /purchase_vip_with_diamonds_atomic\(uuid, integer, integer, text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated/
  );
  assert.match(
    migration,
    /reconcile_diamond_purchase_refund\(uuid, integer, integer\)[\s\S]*FROM PUBLIC, anon, authenticated/
  );
});

test('Printful webhook secrets are header-only and fulfillment writes are checked', async () => {
  const [webhook, purchase] = await Promise.all([
    readFile(new URL('../pages/api/store/webhooks/printful.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/store/purchase-with-diamonds.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(webhook, /req\.query\.secret/);
  assert.match(webhook, /x-smarter-poker-webhook-secret/);
  assert.match(purchase, /provider state update matched zero orders/i);
});
