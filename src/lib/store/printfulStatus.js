const { createHash, timingSafeEqual } = require('node:crypto');

const PRINTFUL_API_BASE = 'https://api.printful.com';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_SYNC_PRODUCTS = 500;

/**
 * READ-ONLY PRINTFUL STATUS (2026-10-17).
 *
 * The four Printful variables in Vercel are write-only ("sensitive"), so no
 * operator and no agent can read the API token to ask Printful what the store
 * holds. This module runs inside the deployment that does hold it and answers
 * two questions, without ever returning a secret:
 *
 *   1. Is the v2 webhook configured, to which URL, for which events, and does
 *      the signing secret Printful holds equal PRINTFUL_WEBHOOK_SECRET? The
 *      webhook's public key is returned because it is not a secret: Printful
 *      sends it in the x-pf-webhook-public-key header of every delivery.
 *   2. Which sync products and sync variants exist in the store, so catalog
 *      rows can be mapped to real sync_variant_ids by name, size and colour.
 *
 * It never writes to Printful, never places or confirms an order.
 */
function clean(value, max = 4096) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = createHash('sha256').update(a.trim().toLowerCase()).digest();
  const hb = createHash('sha256').update(b.trim().toLowerCase()).digest();
  return timingSafeEqual(ha, hb);
}

async function printfulGet(path, { token, storeId, fetchImpl, apiBase }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { Authorization: `Bearer ${token}` };
  if (storeId) {
    headers['X-PF-Store-Id'] = storeId;
  }
  try {
    const response = await fetchImpl(`${apiBase}${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return { ok: false, status: error?.name === 'AbortError' ? 504 : 502, payload: null };
  } finally {
    clearTimeout(timer);
  }
}

function webhookFrom(payload) {
  const data = payload?.data ?? payload?.result ?? null;
  if (!data || typeof data !== 'object') return null;
  const events = Array.isArray(data.events)
    ? data.events.map((e) => clean(e?.type ?? e, 80)).filter(Boolean)
    : Array.isArray(data.types)
      ? data.types.map((t) => clean(t, 80)).filter(Boolean)
      : [];
  return {
    url: clean(data.default_url ?? data.url, 2048),
    events,
    expiresAt: clean(data.expires_at, 64),
    publicKey: clean(data.public_key, 512),
    secretKey: clean(data.secret_key, 512),
  };
}

async function readPrintfulStatus({
  env = process.env,
  fetchImpl = globalThis.fetch,
  apiBase = PRINTFUL_API_BASE,
} = {}) {
  const token = clean(env.PRINTFUL_API_TOKEN);
  const storeId = clean(env.PRINTFUL_STORE_ID, 64);
  const result = {
    tokenConfigured: Boolean(token),
    storeConfigured: Boolean(storeId),
    webhook: null,
    syncProducts: [],
    errors: [],
  };
  if (!token) {
    result.errors.push('PRINTFUL_API_TOKEN is not configured');
    return result;
  }
  const ctx = { token, storeId, fetchImpl, apiBase: String(apiBase).replace(/\/$/, '') };

  const hook = await printfulGet('/v2/webhooks', ctx);
  if (hook.ok) {
    const parsed = webhookFrom(hook.payload);
    result.webhook = parsed
      ? {
          configured: Boolean(parsed.url),
          url: parsed.url,
          events: parsed.events,
          expiresAt: parsed.expiresAt,
          publicKey: parsed.publicKey,
          secretMatchesEnv: parsed.secretKey
            ? sameSecret(parsed.secretKey, clean(env.PRINTFUL_WEBHOOK_SECRET) || '')
            : null,
          envPublicKeyMatches: parsed.publicKey
            ? clean(env.PRINTFUL_WEBHOOK_PUBLIC_KEY, 512) === parsed.publicKey
            : null,
        }
      : { configured: false };
  } else {
    result.errors.push(`Webhook configuration read failed (${hook.status})`);
  }

  // What this token can reach: the store-info endpoint the readiness probe
  // used to call, and the orders endpoint fulfillment actually uses. Status
  // codes only; an order list's body never leaves this function.
  result.probes = {};
  for (const path of ['/store', '/orders?limit=1']) {
    const probe = await printfulGet(path, ctx);
    result.probes[path] = {
      ok: probe.ok,
      status: probe.status,
      reason: probe.ok ? null : clean(probe.payload?.error?.message ?? probe.payload?.result, 160),
    };
  }

  for (let offset = 0; offset < MAX_SYNC_PRODUCTS; offset += 100) {
    const page = await printfulGet(`/store/products?limit=100&offset=${offset}`, ctx);
    if (!page.ok) {
      result.errors.push(`Sync product list read failed (${page.status})`);
      break;
    }
    const rows = Array.isArray(page.payload?.result) ? page.payload.result : [];
    for (const row of rows) {
      const detail = await printfulGet(`/store/products/${encodeURIComponent(row.id)}`, ctx);
      const variants =
        detail.ok && Array.isArray(detail.payload?.result?.sync_variants)
          ? detail.payload.result.sync_variants.map((v) => ({
              syncVariantId: v.id,
              catalogVariantId: v.variant_id ?? v.product?.variant_id ?? null,
              name: clean(v.name, 255),
              size: clean(v.size, 40),
              color: clean(v.color, 60),
              sku: clean(v.sku, 64),
              externalId: clean(v.external_id, 64),
              synced: v.synced !== false,
            }))
          : [];
      if (!detail.ok) result.errors.push(`Sync product ${row.id} read failed (${detail.status})`);
      result.syncProducts.push({
        syncProductId: row.id,
        name: clean(row.name, 255),
        externalId: clean(row.external_id, 64),
        variantCount: Number(row.variants) || variants.length,
        variants,
      });
    }
    if (rows.length < 100) break;
  }
  return result;
}

module.exports = { readPrintfulStatus, PRINTFUL_API_BASE };
