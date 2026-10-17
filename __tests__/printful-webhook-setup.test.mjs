import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerPrintfulWebhook, WEBHOOK_URL } = require('../src/lib/store/printfulWebhookSetup.js');

const ENV = { PRINTFUL_API_TOKEN: 'tkn-zq9x', PRINTFUL_STORE_ID: '123' };
const SECRET = 'ab'.repeat(32);
const PUBLIC = 'pk-qv7w-public';
const { publicKey: RECIPIENT, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function open(sealed) {
  const dataKey = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(sealed.encKey, 'base64'),
  );
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8'));
}

function fakeFetch(existing, calls) {
  return async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'GET') return { ok: true, status: 200, json: async () => ({ data: existing }) };
    const body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { ...body, secret_key: SECRET, public_key: PUBLIC } }),
    };
  };
}

test('registers our webhook and returns its keys only sealed', async () => {
  const calls = [];
  const out = await registerPrintfulWebhook({
    recipientPublicKeyPem: RECIPIENT, env: ENV, fetchImpl: fakeFetch({ default_url: null }, calls),
  });
  assert.deepEqual(calls.map((c) => c.init.method), ['GET', 'POST']);
  const posted = JSON.parse(calls[1].init.body);
  assert.equal(posted.default_url, WEBHOOK_URL);
  assert.deepEqual(posted.events.map((e) => e.type).sort(), ['order_canceled', 'order_failed', 'shipment_returned', 'shipment_sent']);
  assert.equal(calls[1].init.headers['X-PF-Store-Id'], '123');
  const text = JSON.stringify(out);
  for (const leak of [SECRET, PUBLIC, 'tkn-zq9x']) assert.ok(!text.includes(leak), `leaked ${leak}`);
  assert.equal(out.registered, true);
  assert.deepEqual(open(out.sealedKeys), { PRINTFUL_WEBHOOK_SECRET: SECRET, PRINTFUL_WEBHOOK_PUBLIC_KEY: PUBLIC });
});

test('an existing webhook at our URL is resealed, never re-registered', async () => {
  const calls = [];
  const out = await registerPrintfulWebhook({
    recipientPublicKeyPem: RECIPIENT,
    env: ENV,
    fetchImpl: fakeFetch({ default_url: WEBHOOK_URL, events: [{ type: 'shipment_sent' }], secret_key: SECRET, public_key: PUBLIC }, calls),
  });
  assert.deepEqual(calls.map((c) => c.init.method), ['GET']);
  assert.equal(out.registered, false);
  assert.equal(open(out.sealedKeys).PRINTFUL_WEBHOOK_PUBLIC_KEY, PUBLIC);
});

test('a webhook at any other URL is refused, not replaced', async () => {
  const calls = [];
  await assert.rejects(
    registerPrintfulWebhook({
      recipientPublicKeyPem: RECIPIENT, env: ENV, fetchImpl: fakeFetch({ default_url: 'https://elsewhere.example/hook' }, calls),
    }),
    (err) => err.status === 409,
  );
  assert.deepEqual(calls.map((c) => c.init.method), ['GET']);
});

test('a weak or missing recipient key is refused before Printful is called', async () => {
  const calls = [];
  const weak = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).publicKey;
  for (const pem of [weak, undefined, 'nope']) {
    await assert.rejects(
      registerPrintfulWebhook({ recipientPublicKeyPem: pem, env: ENV, fetchImpl: fakeFetch({}, calls) }),
      (err) => err.status === 400,
    );
  }
  await assert.rejects(
    registerPrintfulWebhook({ recipientPublicKeyPem: RECIPIENT, env: {}, fetchImpl: fakeFetch({}, calls) }),
    (err) => err.status === 503,
  );
  assert.equal(calls.length, 0);
});
