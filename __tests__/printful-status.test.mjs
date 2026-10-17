import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readPrintfulStatus } = require('../src/lib/store/printfulStatus.js');

function fakeFetch(routes, calls) {
  return async (url, init) => {
    calls.push({ url, init });
    const path = url.replace('https://api.printful.com', '');
    const hit = routes[path];
    if (!hit) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => hit };
  };
}

const ENV = {
  PRINTFUL_API_TOKEN: 'tkn-zq9x',
  PRINTFUL_STORE_ID: '123',
  PRINTFUL_WEBHOOK_SECRET: 'abcd',
  PRINTFUL_WEBHOOK_PUBLIC_KEY: '',
};

test('reports the webhook without ever returning its secret, and maps sync variants', async () => {
  const calls = [];
  const fetchImpl = fakeFetch(
    {
      '/v2/webhooks': {
        data: {
          default_url: 'https://smarter.poker/api/store/webhooks/printful',
          expires_at: null,
          events: [{ type: 'shipment_sent' }],
          public_key: 'pk_live',
          secret_key: 'ABCD',
        },
      },
      '/store/products?limit=100&offset=0': {
        result: [{ id: 7, name: 'Hoodie', external_id: 'h1', variants: 1 }],
      },
      '/store/products/7': {
        result: {
          sync_variants: [
            {
              id: 99,
              variant_id: 4012,
              name: 'Hoodie / Black / L',
              size: 'L',
              color: 'Black',
              sku: 'H-L',
              external_id: 'v1',
              synced: true,
            },
          ],
        },
      },
    },
    calls
  );
  const out = await readPrintfulStatus({ env: ENV, fetchImpl });
  assert.equal(out.webhook.configured, true);
  assert.equal(out.webhook.publicKey, 'pk_live');
  assert.equal(out.webhook.secretMatchesEnv, true);
  assert.equal(out.webhook.envPublicKeyMatches, false);
  assert.equal(JSON.stringify(out).includes('ABCD'), false, 'the secret never leaves');
  assert.equal(JSON.stringify(out).includes('tkn-zq9x'), false, 'the token never leaves');
  assert.deepEqual(out.syncProducts[0].variants[0], {
    syncVariantId: 99,
    catalogVariantId: 4012,
    name: 'Hoodie / Black / L',
    size: 'L',
    color: 'Black',
    sku: 'H-L',
    externalId: 'v1',
    synced: true,
  });
  assert.ok(
    calls.every((c) => c.init.method === 'GET'),
    'read only'
  );
  assert.equal(calls[0].init.headers['X-PF-Store-Id'], '123');
});

test('without a token it says so and calls nothing', async () => {
  const calls = [];
  const out = await readPrintfulStatus({ env: {}, fetchImpl: fakeFetch({}, calls) });
  assert.equal(out.tokenConfigured, false);
  assert.equal(calls.length, 0);
});
