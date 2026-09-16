/**
 * Public marketplace readiness probe.
 *
 * The response contains bounded capability signals only. Secrets, provider
 * payloads, identifiers, and raw error messages are never serialized.
 * Live checks cover stripe, supabase, and printful without mutating commerce.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

const { runMarketplaceReadiness } = require('../../../src/lib/store/marketplaceReadiness');
const {
  isAutoConfirmEnabled,
  isPrintfulConfigured,
  isPrintfulReady,
  resolvePrintfulMapping,
} = require('../../../src/lib/store/printfulFulfillment');

const CACHE_TTL_MS = 30_000;
let cached = null;
let inFlight = null;

function reportHealthError(dependency, error) {
  try {
    reportApiError(error, {
      route: '/api/store/readiness',
      dependency,
      operation: 'marketplace_health_probe',
    });
  } catch (_) {
    // Diagnostics must never make the public probe fail.
  }
}

export async function getMarketplaceReadiness({ force = false } = {}) {
  const now = Date.now();
  if (!force && cached && now - cached.checkedAt < CACHE_TTL_MS) return cached.value;
  if (!force && inFlight) return inFlight;

  const run = runMarketplaceReadiness({
    env: process.env,
    createClient,
    fetchImpl: globalThis.fetch,
    resolvePrintfulMapping,
    isAutoConfirmEnabled,
    isPrintfulConfigured,
    isPrintfulReady,
    onError: reportHealthError,
  }).then((value) => {
    cached = { checkedAt: Date.now(), value };
    return value;
  });

  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) inFlight = null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'GET only' });
  }

  // The payload contains capability booleans only, so edge caching is safe and
  // prevents a public probe from multiplying Stripe/Supabase health traffic
  // across serverless instances.
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=30');
  try {
    return res.status(200).json(await getMarketplaceReadiness());
  } catch (error) {
    reportHealthError('readiness', error);
    return res.status(503).json({
      success: false,
      ready: false,
      status: 'error',
      error: 'marketplace_health_unavailable',
    });
  }
}
