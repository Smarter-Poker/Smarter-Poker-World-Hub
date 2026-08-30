import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const printful = require('../src/lib/store/printfulFulfillment.js');

const ORDER_ID = '3d4f95d1-0aae-49fb-82ca-a984fbd1dd01';

test('Printful readiness requires a token and the deliberate auto-confirm switch', () => {
  assert.equal(printful.isPrintfulReady({}), false);
  assert.equal(printful.isPrintfulReady({ PRINTFUL_API_TOKEN: 'token' }), false);
  assert.equal(
    printful.isPrintfulReady({
      PRINTFUL_API_TOKEN: 'token',
      PRINTFUL_AUTO_CONFIRM: 'true',
    }),
    true
  );
});

test('UUID order ids round-trip through Printful external_id', () => {
  const external = printful.sanitizeExternalOrderId(ORDER_ID);
  assert.equal(external, '3d4f95d10aae49fb82caa984fbd1dd01');
  assert.equal(external.length, 32);
  assert.equal(printful.restoreUuidFromExternalId(external), ORDER_ID);
  assert.equal(printful.restoreUuidFromExternalId('not-an-order'), null);
});

test('variant mappings override item mappings', () => {
  assert.deepEqual(
    printful.resolvePrintfulMapping(
      { printful: { sync_variant_id: 100 } },
      { printful: { sync_variant_id: 200 } }
    ),
    { sync_variant_id: 200 }
  );
  assert.deepEqual(printful.resolvePrintfulMapping({ external_variant_id: 'tee-black-m' }, null), {
    external_variant_id: 'tee-black-m',
  });
});

test('recipient normalization reads Stripe collected shipping details', () => {
  const recipient = printful.normalizePrintfulRecipient({
    collected_information: {
      shipping_details: {
        name: 'Ada Lovelace',
        address: {
          line1: '123 Main Street',
          line2: 'Suite 4',
          city: 'Chicago',
          state: 'IL',
          postal_code: '60601',
          country: 'US',
        },
      },
    },
    customer_details: { email: 'ada@example.com', phone: '+13125550100' },
  });
  assert.deepEqual(recipient, {
    name: 'Ada Lovelace',
    address1: '123 Main Street',
    address2: 'Suite 4',
    city: 'Chicago',
    state_code: 'IL',
    country_code: 'US',
    zip: '60601',
    email: 'ada@example.com',
    phone: '+13125550100',
  });
});

test('order item builder refuses an unmapped physical line', () => {
  assert.throws(() => printful.buildPrintfulItems([{ quantity: 1 }]), {
    code: 'PRINTFUL_NOT_CONFIGURED',
  });
  assert.deepEqual(
    printful.buildPrintfulItems([
      {
        quantity: 2,
        providerVariant: { sync_variant_id: 987654 },
      },
    ]),
    [{ sync_variant_id: 987654, quantity: 2 }]
  );
});

test('order creation uses an idempotent draft request without touching the network', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ result: { id: 44, status: 'draft' } }),
    };
  };
  const result = await printful.createPrintfulOrder({
    orderId: ORDER_ID,
    recipient: {
      name: 'Test Customer',
      address1: '1 Test Way',
      city: 'Chicago',
      country_code: 'US',
      zip: '60601',
    },
    items: [{ sync_variant_id: 123, quantity: 1 }],
    confirm: false,
    fetchImpl: fakeFetch,
    env: { PRINTFUL_API_TOKEN: 'private-test-token', PRINTFUL_STORE_ID: '55' },
    apiBase: 'https://printful.invalid',
  });

  assert.deepEqual(result, { id: 44, status: 'draft' });
  assert.equal(request.url, 'https://printful.invalid/orders?confirm=false&update_existing=true');
  assert.equal(request.options.headers.Authorization, 'Bearer private-test-token');
  assert.equal(request.options.headers['X-PF-Store-ID'], '55');
  const body = JSON.parse(request.options.body);
  assert.equal(body.external_id, '3d4f95d10aae49fb82caa984fbd1dd01');
  assert.deepEqual(body.items, [{ sync_variant_id: 123, quantity: 1 }]);
});

test('checkout, webhooks, catalog, and Diamond fulfillment stay wired together', async () => {
  const [
    checkout,
    stripeWebhook,
    printfulWebhook,
    catalog,
    diamondPurchase,
    merchStore,
    dryRunMigration,
  ] = await Promise.all([
    readFile(new URL('../pages/api/store/create-checkout-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/store/webhooks/stripe.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/store/webhooks/printful.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/store/merch-catalog.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/store/purchase-with-diamonds.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/store/MerchStore.jsx', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../supabase/migrations/20260829120000_reserve_merch_order_dry_run.sql',
        import.meta.url
      ),
      'utf8'
    ),
  ]);

  assert.match(checkout, /automaticFulfillment \? 'automatic' : 'manual'/);
  assert.doesNotMatch(checkout, /FULFILLMENT_NOT_CONFIGURED/);
  assert.match(checkout, /resolvePrintfulMapping/);
  assert.match(stripeWebhook, /createPrintfulOrder/);
  assert.match(stripeWebhook, /provider_unknown/);
  assert.match(stripeWebhook, /settle_paid_merch_order_atomic/);
  assert.match(stripeWebhook, /if \(releaseError\) throw releaseError/);
  assert.match(printfulWebhook, /timingSafeEqual/);
  assert.match(printfulWebhook, /package_shipped/);
  assert.match(catalog, /print_on_demand_available/);
  assert.match(diamondPurchase, /SHIPPING_ADDRESS_INCOMPLETE/);
  assert.match(diamondPurchase, /createPrintfulOrder/);
  assert.match(diamondPurchase, /purchase_merch_with_diamonds_atomic/);
  assert.match(diamondPurchase, /p_request_hash: requestHash/);
  assert.match(merchStore, /requiresShipping/);
  assert.doesNotMatch(merchStore, /Card Checkout Required For Shipping/);
  assert.match(merchStore, /Made To Order/);
  assert.match(dryRunMigration, /p_dry_run boolean/);
  assert.match(dryRunMigration, /public\.release_merch_order\(v_result -> 'lines'\)/);
});
