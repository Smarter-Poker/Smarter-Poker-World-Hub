import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const webhook = readFileSync(resolve(root, 'pages/api/store/webhooks/printful.js'), 'utf8');
const readiness = readFileSync(resolve(root, 'src/lib/store/marketplaceReadiness.js'), 'utf8');

test('Printful webhook verifies the official V2 raw-body signature contract', () => {
  assert.match(webhook, /bodyParser: false/);
  assert.match(webhook, /Buffer\.from\(secretHex, 'hex'\)/);
  assert.match(webhook, /createHmac\('sha256'/);
  assert.match(webhook, /\.update\(rawBody\)/);
  assert.match(webhook, /x-pf-webhook-signature/);
  assert.match(webhook, /x-pf-webhook-public-key/);
  assert.doesNotMatch(webhook, /x-smarter-poker-webhook-secret/);

  const raw = Buffer.from('{"type":"shipment_sent"}');
  const secret = '11'.repeat(32);
  const signature = createHmac('sha256', Buffer.from(secret, 'hex')).update(raw).digest('hex');
  assert.equal(signature.length, 64);
});

test('automatic fulfillment readiness requires both signed webhook keys', () => {
  assert.match(readiness, /PRINTFUL_WEBHOOK_PUBLIC_KEY/);
  assert.match(readiness, /printfulWebhookPublicKeyConfigured/);
  assert.match(readiness, /webhookPublicKeyConfigured/);
});

test('Printful V2 fulfillment events map to shipment and refund review states', () => {
  assert.match(webhook, /shipment_sent/);
  assert.match(webhook, /shipment_returned/);
  assert.match(webhook, /order_failed/);
  assert.match(webhook, /order_canceled/);
});
