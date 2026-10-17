'use strict';

/**
 * Registers the store's Printful v2 webhook and hands its signing keys back
 * sealed, so no person and no log ever sees them in the clear.
 *
 * Printful only issues a webhook's secret_key/public_key when the webhook is
 * registered, and the token that can register it lives only in production. So
 * the operator supplies an RSA public key (>= 3072 bits); the keys come back
 * as an envelope (AES-256-GCM data key wrapped with RSA-OAEP-SHA256) that only
 * the holder of the matching private key can open and write into the host's
 * env (PRINTFUL_WEBHOOK_SECRET, PRINTFUL_WEBHOOK_PUBLIC_KEY).
 *
 * It never rotates a webhook: one already registered at our URL is resealed
 * from Printful's own record (no new keys), one at any other URL is refused.
 * It never places, confirms or charges anything.
 */

const crypto = require('node:crypto');
const { PRINTFUL_API_BASE } = require('./printfulStatus');

const WEBHOOK_URL = 'https://smarter.poker/api/store/webhooks/printful';
// The event types pages/api/store/webhooks/printful.js acts on (v2 names).
const WEBHOOK_EVENTS = ['shipment_sent', 'shipment_returned', 'order_failed', 'order_canceled'];
const MIN_RSA_BITS = 3072;
const TIMEOUT_MS = 12000;

class SetupError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function clean(value, maxLength = 255) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function recipientKey(pem) {
  if (typeof pem !== 'string' || pem.length > 5000 || !pem.includes('BEGIN PUBLIC KEY')) {
    throw new SetupError(400, 'recipientPublicKeyPem must be a PEM-encoded RSA public key');
  }
  let key;
  try {
    key = crypto.createPublicKey(pem);
  } catch (_) {
    throw new SetupError(400, 'recipientPublicKeyPem could not be parsed');
  }
  const bits = key.asymmetricKeyDetails?.modulusLength || 0;
  if (key.asymmetricKeyType !== 'rsa' || bits < MIN_RSA_BITS) {
    throw new SetupError(400, `recipientPublicKeyPem must be RSA of at least ${MIN_RSA_BITS} bits`);
  }
  return key;
}

function seal(key, plaintext) {
  const dataKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encKey = crypto.publicEncrypt(
    { key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    dataKey,
  );
  return {
    alg: 'RSA-OAEP-256+A256GCM',
    encKey: encKey.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

async function call(method, path, ctx, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' };
    if (ctx.storeId) headers['X-PF-Store-Id'] = ctx.storeId;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await ctx.fetchImpl(`${ctx.apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, payload };
  } catch (_) {
    return { ok: false, status: 0, payload: null };
  } finally {
    clearTimeout(timer);
  }
}

function hookFrom(payload) {
  const data = payload?.data ?? payload?.result ?? null;
  if (!data || typeof data !== 'object') return null;
  return {
    url: clean(data.default_url ?? data.url, 2048),
    events: Array.isArray(data.events)
      ? data.events.map((e) => clean(e?.type ?? e, 80)).filter(Boolean)
      : [],
    expiresAt: clean(data.expires_at, 64),
    secretKey: clean(data.secret_key, 512),
    publicKey: clean(data.public_key, 512),
  };
}

function providerMessage(payload) {
  const m = payload?.error?.message ?? payload?.detail ?? payload?.error ?? payload?.result;
  return typeof m === 'string' ? m.replace(/\s+/g, ' ').slice(0, 200) : null;
}

function sealedResult(key, hook, registered) {
  if (!hook?.secretKey || !hook?.publicKey) {
    throw new SetupError(502, 'Printful returned no signing keys for the webhook');
  }
  return {
    registered,
    resealed: !registered,
    url: hook.url || WEBHOOK_URL,
    events: hook.events,
    expiresAt: hook.expiresAt,
    sealedKeys: seal(key, JSON.stringify({
      PRINTFUL_WEBHOOK_SECRET: hook.secretKey,
      PRINTFUL_WEBHOOK_PUBLIC_KEY: hook.publicKey,
    })),
  };
}

async function registerPrintfulWebhook({
  recipientPublicKeyPem,
  env = process.env,
  fetchImpl = globalThis.fetch,
  apiBase = PRINTFUL_API_BASE,
} = {}) {
  const key = recipientKey(recipientPublicKeyPem);
  const token = clean(env.PRINTFUL_API_TOKEN);
  const storeId = clean(env.PRINTFUL_STORE_ID, 64);
  if (!token) throw new SetupError(503, 'PRINTFUL_API_TOKEN is not configured');
  if (!storeId) throw new SetupError(503, 'PRINTFUL_STORE_ID is not configured');
  const ctx = { token, storeId, fetchImpl, apiBase: String(apiBase).replace(/\/$/, '') };

  const current = await call('GET', '/v2/webhooks', ctx);
  if (!current.ok) throw new SetupError(502, `Webhook configuration read failed (${current.status})`);
  const existing = hookFrom(current.payload);
  if (existing?.url) {
    if (existing.url !== WEBHOOK_URL) {
      throw new SetupError(409, `A Printful webhook is already registered at ${existing.url}; this route never replaces one`);
    }
    return sealedResult(key, existing, false);
  }

  const created = await call('POST', '/v2/webhooks', ctx, {
    default_url: WEBHOOK_URL,
    expires_at: null,
    events: WEBHOOK_EVENTS.map((type) => ({ type })),
  });
  if (!created.ok) {
    const m = providerMessage(created.payload);
    throw new SetupError(502, `Printful refused the webhook (${created.status})${m ? `: ${m}` : ''}`);
  }
  return sealedResult(key, hookFrom(created.payload), true);
}

module.exports = { registerPrintfulWebhook, SetupError, WEBHOOK_URL, WEBHOOK_EVENTS, MIN_RSA_BITS };
