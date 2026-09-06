#!/usr/bin/env node

const args = process.argv.slice(2);
const requireCommerce = args.includes('--require-commerce');
const requireCheckout = args.includes('--require-checkout');
const requirePerformance = args.includes('--require-performance');
const requireProductionTruth = args.includes('--require-production-truth');
const requireAutomaticFulfillment = args.includes('--require-automatic-fulfillment');
const suppliedBase = args.find((arg) => !arg.startsWith('--'));
const baseUrl = String(suppliedBase || process.env.MARKETPLACE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const timeoutMs = Math.max(1_000, Number(process.env.MARKETPLACE_PROBE_TIMEOUT_MS) || 15_000);
const maxLatencyMs = Math.max(1_000, Number(process.env.MARKETPLACE_MAX_LATENCY_MS) || 8_000);
const bypassSecret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
const expectedSha = String(process.env.MARKETPLACE_EXPECTED_SHA || '').trim().toLowerCase();
const MIN_HERO_ASSET_BYTES = 1_024;
const MARKETPLACE_PHASE7_SCHEMA_MARKER = 'marketplace_phase7_vip_acquisition_mutex:v1';

if (expectedSha && !/^[0-9a-f]{40}$/.test(expectedSha)) {
  console.error('FAIL MARKETPLACE_EXPECTED_SHA must be an exact 40-character Git SHA.');
  process.exit(1);
}
if (requireProductionTruth && !expectedSha) {
  console.error('FAIL --require-production-truth requires MARKETPLACE_EXPECTED_SHA.');
  process.exit(1);
}

function requestHeaders(extra = {}) {
  return {
    'User-Agent': 'SmarterPoker-Marketplace-Readiness/1.1',
    ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
    ...extra,
  };
}

const routes = [
  { path: '/hub/diamond-store', canonical: '/hub/diamond-store' },
  { path: '/hub/vip-membership', canonical: '/hub/vip-membership' },
  { path: '/hub/vip-membership/compare', canonical: '/hub/vip-membership/compare' },
  { path: '/hub/vip-membership/manage', canonical: '/hub/vip-membership/manage' },
  { path: '/hub/merch-store', canonical: '/hub/merch-store' },
  { path: '/hub/merch-store/hoodie-neural', canonical: '/hub/merch-store/hoodie-neural' },
  { path: '/hub/merch-store/fulfillment', canonical: '/hub/merch-store/fulfillment' },
  { path: '/hub/diamond-store/cart', canonical: '/hub/diamond-store/cart' },
  { path: '/hub/diamond-store/orders', canonical: '/hub/diamond-store/orders' },
  { path: '/hub/diamond-store/wishlist', canonical: '/hub/diamond-store/wishlist' },
  {
    path: '/hub/diamond-store/orders/phase-11-proof?source=merchandise',
    canonical: '/hub/diamond-store/orders/phase-11-proof',
  },
  { path: '/hub/smarter-rewards', canonical: '/hub/smarter-rewards' },
  { path: '/hub/smarter-rewards/daily_login', canonical: '/hub/smarter-rewards/daily_login' },
  { path: '/hub/club-shop', canonical: '/hub/club-shop' },
  {
    path: '/hub/club-shop/00000000-0000-4000-8000-000000000094?clubId=00000000-0000-4000-8000-000000000093',
    canonical: '/hub/club-shop/00000000-0000-4000-8000-000000000094',
  },
];
const assets = [
  '/images/store-v3/diamond-vault-hero.webp',
  '/images/store-v3/vip-hero.webp',
  '/images/store-v3/merch-hero.webp',
  '/images/store-v3/rewards-hero.webp',
  '/images/store-v3/club-shop-hero.webp',
];

function marketplaceRouteMarker(canonical) {
  return `data-marketplace-route="${canonical}"`;
}

function hasWebpSignature(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 30) return false;
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF'
    || String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP') return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredFileSize = view.getUint32(4, true) + 8;
  if (declaredFileSize !== bytes.length) return false;

  const chunkType = String.fromCharCode(...bytes.slice(12, 16));
  const chunkSize = view.getUint32(16, true);
  const paddedChunkEnd = 20 + chunkSize + (chunkSize % 2);
  if (paddedChunkEnd > bytes.length) return false;

  if (chunkType === 'VP8 ') {
    if (chunkSize < 10 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return false;
    const width = bytes[26] | ((bytes[27] & 0x3f) << 8);
    const height = bytes[28] | ((bytes[29] & 0x3f) << 8);
    return width > 0 && height > 0;
  }
  if (chunkType === 'VP8L') {
    return chunkSize >= 5 && bytes[20] === 0x2f;
  }
  if (chunkType === 'VP8X') {
    if (chunkSize < 10) return false;
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width > 0 && height > 0;
  }
  return false;
}

async function probe(path, expectedType, marker = '', { verifyWebp = false } = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'manual',
      headers: requestHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = response.headers.get('content-type') || '';
    const redirected = response.status >= 300 && response.status < 400;
    const body = marker ? await response.text() : '';
    const bytes = verifyWebp ? new Uint8Array(await response.arrayBuffer()) : null;
    const validAsset = !verifyWebp || (
      bytes.length >= MIN_HERO_ASSET_BYTES && hasWebpSignature(bytes)
    );
    const okay = response.ok
      && !redirected
      && (!expectedType || contentType.includes(expectedType))
      && (!marker || body.includes(marker))
      && validAsset;
    const reason = redirected
      ? 'unexpected_redirect'
      : !response.ok
      ? `http_${response.status}`
      : expectedType && !contentType.includes(expectedType)
        ? 'unexpected_content_type'
        : marker && !body.includes(marker)
          ? 'missing_marker'
          : !validAsset
            ? bytes.length < MIN_HERO_ASSET_BYTES ? 'asset_too_small' : 'invalid_webp_signature'
          : null;
    return {
      path,
      okay,
      status: response.status,
      contentType,
      reason,
      location: response.headers.get('location') || '',
      bytes: bytes?.length ?? null,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      path,
      okay: false,
      status: 0,
      contentType: '',
      reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
      location: '',
      bytes: null,
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function probePrivate({ path: privatePath, method = 'GET', expectedStatus = 401 }) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${privatePath}`, {
      method,
      redirect: 'manual',
      headers: requestHeaders({
        Accept: 'application/json',
        Origin: baseUrl,
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      }),
      ...(method !== 'GET' ? { body: '{}' } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const cacheControl = response.headers.get('cache-control') || '';
    const vary = response.headers.get('vary') || '';
    const contentType = response.headers.get('content-type') || '';
    const responseBody = await response.text();
    let jsonBody = null;
    try {
      jsonBody = JSON.parse(responseBody);
    } catch (_) {
      jsonBody = null;
    }
    const privateNoStore = /(?:^|,)\s*private\b/i.test(cacheControl)
      && /(?:^|,)\s*no-store\b/i.test(cacheControl);
    const variesOnAuthorization = vary.split(',')
      .some((value) => value.trim().toLowerCase() === 'authorization');
    const redirected = response.status >= 300 && response.status < 400;
    const okay = !redirected
      && response.status === expectedStatus
      && privateNoStore
      && variesOnAuthorization
      && contentType.includes('application/json')
      && jsonBody !== null;
    return {
      path: method === 'GET'
        ? `${privatePath} (private)`
        : `${privatePath} (${method.toLowerCase()}, private)`,
      okay,
      status: response.status,
      contentType,
      reason: redirected
        ? 'unexpected_redirect'
        : response.status !== expectedStatus
        ? `expected_${expectedStatus}_received_${response.status}`
        : !privateNoStore
          ? 'missing_private_no_store'
          : !variesOnAuthorization
            ? 'missing_vary_authorization'
            : !contentType.includes('application/json') || jsonBody === null
              ? 'invalid_json_response'
            : null,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      path: method === 'GET'
        ? `${privatePath} (private)`
        : `${privatePath} (${method.toLowerCase()}, private)`,
      okay: false,
      status: 0,
      contentType: '',
      reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
      location: '',
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function probeExpectedStatus({ path, method = 'GET', expectedStatus, expectedLocation = '' }) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      redirect: 'manual',
      headers: requestHeaders({ Accept: 'application/json, text/html;q=0.8' }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const location = response.headers.get('location') || '';
    const expectedOrigin = new URL(baseUrl).origin;
    let parsedLocation = null;
    try {
      parsedLocation = location ? new URL(location, baseUrl) : null;
    } catch (_) {
      parsedLocation = null;
    }
    const normalizedLocation = parsedLocation?.pathname || '';
    const locationMatches = !expectedLocation || (
      parsedLocation?.origin === expectedOrigin && normalizedLocation === expectedLocation
    );
    const okay = response.status === expectedStatus
      && locationMatches;
    return {
      path: `${path} (${method.toLowerCase()}, contract)`,
      okay,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      location,
      reason: response.status !== expectedStatus
        ? `expected_${expectedStatus}_received_${response.status}`
        : !locationMatches
          ? 'unexpected_location'
          : null,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      path: `${path} (${method.toLowerCase()}, contract)`,
      okay: false,
      status: 0,
      contentType: '',
      location: '',
      reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function mapWithConcurrency(values, limit, mapper) {
  const output = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

const results = await Promise.all([
  ...routes.map((route) => probe(
    route.path,
    'text/html',
    marketplaceRouteMarker(route.canonical)
  )),
  ...assets.map((path) => probe(path, 'image/webp', '', { verifyWebp: true })),
]);

const privateProbeContracts = [
  { path: '/api/store/create-checkout-session', method: 'POST' },
  { path: '/api/store/diamond-transactions' },
  { path: '/api/store/diamond-transfer', method: 'POST' },
  { path: '/api/store/merch-order' },
  { path: '/api/store/vip-membership-status' },
  { path: '/api/store/switch-vip-plan', method: 'POST' },
  { path: '/api/store/cancel-vip', method: 'POST' },
  { path: '/api/store/order-ledger' },
  { path: '/api/store/checkout-status?session_id=invalid' },
  { path: '/api/store/purchase-with-diamonds', method: 'POST' },
  { path: '/api/store/purchase-vip-with-diamonds', method: 'POST' },
  { path: '/api/store/fulfillment-operations' },
  { path: '/api/store/fulfillment-operations', method: 'POST', expectedStatus: 405 },
  { path: '/api/club-arena/manage-shop' },
  { path: '/api/club-arena/marketplace-items' },
  { path: '/api/club-arena/marketplace-purchase', method: 'POST' },
  { path: '/api/club-arena/refund-purchase', method: 'POST' },
  { path: '/api/club-arena/shop-analytics' },
  { path: '/api/club-arena/shop-items', method: 'POST' },
  { path: '/api/club-arena/shop-purchases' },
  { path: '/api/rewards/progress' },
];
results.push(...await mapWithConcurrency(privateProbeContracts, 4, probePrivate));

let merchCatalog = null;
try {
  const startedAt = Date.now();
  const merchCatalogPath = requireProductionTruth
    ? '/api/store/merch-catalog?strict=1'
    : '/api/store/merch-catalog';
  const response = await fetch(`${baseUrl}${merchCatalogPath}`, {
    redirect: 'manual',
    headers: requestHeaders({ Accept: 'application/json' }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  merchCatalog = body?.data || null;
  const items = Array.isArray(merchCatalog?.items) ? merchCatalog.items : [];
  const variants = items.flatMap((item) => Array.isArray(item?.variants) ? item.variants : []);
  const redirected = response.status >= 300 && response.status < 400;
  const itemContractsReady = items.every((item) => (
    Number.isFinite(Number(item?.price_usd))
    && Number(item.price_usd) > 0
    && Number.isSafeInteger(Number(item?.price_diamonds))
    && Number(item.price_diamonds) > 0
    && item?.fulfillment_ready === true
    && ['automatic', 'manual'].includes(item?.fulfillment_mode)
    && item?.card_checkout_ready === true
    && item?.diamond_checkout_ready === true
    && Array.isArray(item?.payment_methods)
    && item.payment_methods.includes('card')
    && item.payment_methods.includes('diamonds')
  ));
  const variantContractsReady = variants.every((variant) => (
    Number.isFinite(Number(variant?.price_usd))
    && Number(variant.price_usd) > 0
    && Number.isSafeInteger(Number(variant?.price_diamonds))
    && Number(variant.price_diamonds) > 0
    && variant?.fulfillment_ready === true
    && variant?.card_checkout_ready === true
    && variant?.diamond_checkout_ready === true
    && Array.isArray(variant?.payment_methods)
    && variant.payment_methods.includes('card')
    && variant.payment_methods.includes('diamonds')
  ));
  const catalogContractReady = merchCatalog?.catalog_available === true
    && merchCatalog?.manual_fulfillment_available === true
    && Number(merchCatalog?.diamonds_per_dollar) === 100
    && (!requireProductionTruth || merchCatalog?.variants_available === true)
    && (!requireProductionTruth || items.every((item) => (
      item?.has_variants !== true || item.variants.length > 0
    )));
  const okay = !redirected
    && response.ok
    && items.length > 0
    && itemContractsReady
    && variantContractsReady
    && catalogContractReady;
  results.push({
    path: merchCatalogPath,
    okay,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    reason: redirected
      ? 'unexpected_redirect'
      : !response.ok
        ? `http_${response.status}`
        : !body
          ? 'invalid_json_response'
          : items.length === 0
            ? 'empty_catalog'
            : !catalogContractReady
              ? 'invalid_catalog_capabilities'
              : !itemContractsReady
                ? 'invalid_item_payment_contract'
                : !variantContractsReady
                  ? 'invalid_variant_payment_contract'
                  : null,
    latencyMs: Date.now() - startedAt,
  });
} catch (error) {
  results.push({
    path: requireProductionTruth
      ? '/api/store/merch-catalog?strict=1'
      : '/api/store/merch-catalog',
    okay: false,
    status: 0,
    contentType: '',
    reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
    latencyMs: timeoutMs,
  });
}

let readiness = null;
try {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/store/readiness`, {
    redirect: 'manual',
    headers: requestHeaders({ Accept: 'application/json' }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  try {
    readiness = JSON.parse(body);
  } catch (_) {
    readiness = null;
  }
  const redirected = response.status >= 300 && response.status < 400;
  const schemaMarkerReady = !requireProductionTruth || (
    readiness?.dependencies?.supabase?.schemaMarkerReady === true
    && readiness?.dependencies?.supabase?.schemaMarker === MARKETPLACE_PHASE7_SCHEMA_MARKER
  );
  const dependencyTruthReady = !requireProductionTruth || (
    readiness?.dependencies?.supabase?.configured === true
    && readiness?.dependencies?.supabase?.reachable === true
    && readiness?.dependencies?.supabase?.catalogComplete === true
    && schemaMarkerReady
    && readiness?.dependencies?.stripe?.configured === true
    && readiness?.dependencies?.stripe?.reachable === true
  );
  const fulfillmentTruthReady = !requireProductionTruth || (
    readiness?.fulfillmentMode === 'manual'
      ? readiness?.capabilities?.manualMerchFulfillment === true
        && readiness?.capabilities?.automaticMerchFulfillment === false
        && (
          readiness?.dependencies?.printful?.configurationPresent === false
          || (
            readiness?.dependencies?.printful?.configured === true
            && readiness?.dependencies?.printful?.reachable === true
            && Number(readiness?.catalog?.printfulItems) === 0
          )
        )
      : readiness?.fulfillmentMode === 'mixed'
        ? readiness?.dependencies?.printful?.configured === true
          && readiness?.dependencies?.printful?.reachable === true
          && readiness?.capabilities?.manualMerchFulfillment === true
          && readiness?.capabilities?.automaticMerchFulfillment === false
          && Number(readiness?.catalog?.printfulItems) > 0
          && Number(readiness?.catalog?.manualItems) > 0
      : readiness?.fulfillmentMode === 'automatic'
        ? readiness?.dependencies?.printful?.configured === true
          && readiness?.dependencies?.printful?.reachable === true
          && readiness?.capabilities?.automaticMerchFulfillment === true
        : false
  );
  const okay = !redirected
    && response.ok
    && contentType.includes('application/json')
    && readiness?.success === true
    && dependencyTruthReady
    && fulfillmentTruthReady;
  results.push({
    path: '/api/store/readiness',
    okay,
    status: response.status,
    contentType,
    reason: redirected
      ? 'unexpected_redirect'
      : !response.ok
      ? `http_${response.status}`
      : !contentType.includes('application/json') || !readiness
        ? 'invalid_json_response'
        : readiness?.success !== true
          ? 'unhealthy_response'
          : !schemaMarkerReady
            ? 'schema_marker_mismatch'
            : !dependencyTruthReady
              ? 'dependency_contract_incomplete'
              : !fulfillmentTruthReady
                ? 'fulfillment_contract_incomplete'
                : null,
    latencyMs: Date.now() - startedAt,
  });
} catch (error) {
  results.push({
    path: '/api/store/readiness',
    okay: false,
    status: 0,
    contentType: '',
    reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
    latencyMs: timeoutMs,
  });
}

let health = null;
let strictCatalog = null;
if (requireProductionTruth) {
  try {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/api/health`, {
      redirect: 'manual',
      headers: requestHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = response.headers.get('content-type') || '';
    health = await response.json().catch(() => null);
    const version = String(health?.version || '').toLowerCase();
    const redirected = response.status >= 300 && response.status < 400;
    const versionReady = /^[0-9a-f]{40}$/.test(version)
      && (!expectedSha || version === expectedSha);
    const okay = !redirected
      && response.ok
      && contentType.includes('application/json')
      && health?.status === 'ok'
      && health?.checks?.db?.status === 'ok'
      && versionReady;
    results.push({
      path: '/api/health (deployment truth)',
      okay,
      status: response.status,
      contentType,
      reason: redirected
        ? 'unexpected_redirect'
        : !response.ok
          ? `http_${response.status}`
          : !health
            ? 'invalid_json_response'
            : health.status !== 'ok'
              ? 'unhealthy_deployment'
              : health?.checks?.db?.status !== 'ok'
                ? 'database_not_ready'
                : !/^[0-9a-f]{40}$/.test(version)
                  ? 'invalid_deployment_sha'
                  : expectedSha && version !== expectedSha
                    ? 'deployment_sha_mismatch'
                    : null,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    results.push({
      path: '/api/health (deployment truth)',
      okay: false,
      status: 0,
      contentType: '',
      reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
      latencyMs: timeoutMs,
    });
  }

  try {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/api/club-arena/store-catalog?strict=1`, {
      redirect: 'manual',
      headers: requestHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = response.headers.get('content-type') || '';
    strictCatalog = await response.json().catch(() => null);
    const redirected = response.status >= 300 && response.status < 400;
    const diamondPackages = Array.isArray(strictCatalog?.diamondPackages)
      ? strictCatalog.diamondPackages
      : [];
    const actualDiamondIds = diamondPackages.map((entry) => String(entry?.id || '').trim());
    const diamondContractReady = actualDiamondIds.length > 0
      && new Set(actualDiamondIds).size === actualDiamondIds.length
      && diamondPackages.every((entry) => (
        /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(String(entry?.id || ''))
        && Number.isSafeInteger(Number(entry?.diamonds))
        && Number(entry.diamonds) > 0
        && Number.isSafeInteger(Number(entry?.priceCents))
        && Number(entry.priceCents) > 0
        && Number.isFinite(Number(entry?.priceUsd))
        && Number(entry.priceUsd) > 0
        && Math.round(Number(entry.priceUsd) * 100) === Number(entry.priceCents)
        && entry?.cardCheckoutReady === true
        && entry?.diamondCheckoutReady === false
      ));
    const expectedVip = new Map([
      ['monthly', { id: 'vip-monthly', usd: 19.99, diamonds: 1_999, card: true }],
      ['yearly', { id: 'vip-yearly', usd: 199.99, diamonds: 19_999, card: true }],
      ['lifetime', { id: 'vip-lifetime', usd: 499, diamonds: 49_900, card: false }],
    ]);
    const vipPlans = Array.isArray(strictCatalog?.vipPlans) ? strictCatalog.vipPlans : [];
    const vipContractReady = vipPlans.length === expectedVip.size
      && vipPlans.every((plan) => {
        const expected = expectedVip.get(plan?.planKey);
        return Boolean(expected)
          && plan.id === expected.id
          && plan.checkoutPlan === expected.id
          && Number(plan.priceUsd) === expected.usd
          && Number(plan.priceDiamonds) === expected.diamonds
          && plan.cardCheckoutReady === expected.card
          && plan.diamondCheckoutReady === true;
      });
    const authorityReady = strictCatalog?.success === true
      && strictCatalog?.diamondCatalogSource === 'database'
      && Array.isArray(strictCatalog?.warnings)
      && strictCatalog.warnings.length === 0
      && Array.isArray(strictCatalog?.chipPackages)
      && strictCatalog.chipPackages.length === 0
      && Number(strictCatalog?.diamondsPerDollar) === 100;
    const okay = !redirected
      && response.ok
      && contentType.includes('application/json')
      && authorityReady
      && diamondContractReady
      && vipContractReady;
    results.push({
      path: '/api/club-arena/store-catalog?strict=1',
      okay,
      status: response.status,
      contentType,
      reason: redirected
        ? 'unexpected_redirect'
        : !response.ok
          ? `http_${response.status}`
          : !strictCatalog
            ? 'invalid_json_response'
            : !authorityReady
              ? 'catalog_not_authoritative'
              : !diamondContractReady
                ? 'diamond_package_contract_mismatch'
                : !vipContractReady
                  ? 'vip_payment_contract_mismatch'
                  : null,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    results.push({
      path: '/api/club-arena/store-catalog?strict=1',
      okay: false,
      status: 0,
      contentType: '',
      reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
      latencyMs: timeoutMs,
    });
  }

  results.push(...await Promise.all([
    probeExpectedStatus({
      path: '/hub/marketplace',
      expectedStatus: 308,
      expectedLocation: '/hub/diamond-store',
    }),
    probeExpectedStatus({
      path: '/api/club-arena/purchase-chips',
      method: 'POST',
      expectedStatus: 410,
    }),
    probeExpectedStatus({
      path: '/api/store/purchase-daily-vip',
      method: 'POST',
      expectedStatus: 404,
    }),
  ]));
}

for (const result of results) {
  const signal = result.okay ? 'PASS' : 'FAIL';
  const diagnostic = result.reason ? ` (${result.reason})` : '';
  const latency = Number.isFinite(result.latencyMs) ? ` [${result.latencyMs}ms]` : '';
  console.log(`${signal.padEnd(4)} ${String(result.status).padEnd(3)} ${result.path}${diagnostic}${latency}`);
}
if (readiness?.checks) console.log(`Readiness checks: ${JSON.stringify(readiness.checks)}`);
if (readiness?.dependencies) console.log(`Dependency status: ${JSON.stringify(readiness.dependencies)}`);
if (readiness?.capabilities) console.log(`Marketplace capabilities: ${JSON.stringify(readiness.capabilities)}`);
if (readiness?.fulfillmentMode) console.log(`Merchandise fulfillment mode: ${readiness.fulfillmentMode}`);
if (merchCatalog) {
  console.log(`Merchandise catalog: ${Number(merchCatalog.count) || 0} items; manual fulfillment ${merchCatalog.manual_fulfillment_available === true ? 'ready' : 'unavailable'}; automatic fulfillment ${merchCatalog.print_on_demand_available === true ? 'ready' : 'deferred'}`);
}
if (strictCatalog) {
  console.log(`Authoritative catalog: ${strictCatalog.diamondPackages?.length || 0} Diamond packages; ${strictCatalog.vipPlans?.length || 0} VIP plans; source ${strictCatalog.diamondCatalogSource || 'unknown'}`);
}
if (health?.version) console.log(`Deployment SHA: ${health.version}`);

const surfaceFailed = results.some((result) => !result.okay);
const commerceFailed = requireCommerce && readiness?.ready !== true;
const checkoutFailed = requireCheckout && !(
  readiness?.capabilities?.cardCheckout === true
  && readiness?.capabilities?.diamondCheckout === true
);
const automaticFulfillmentFailed = requireAutomaticFulfillment && !(
  readiness?.fulfillmentMode === 'automatic'
  && readiness?.capabilities?.automaticMerchFulfillment === true
);
const performanceFailed = requirePerformance && results.some(
  (result) => result.okay && Number.isFinite(result.latencyMs) && result.latencyMs > maxLatencyMs
);
if (
  surfaceFailed
  || commerceFailed
  || checkoutFailed
  || automaticFulfillmentFailed
  || performanceFailed
) {
  if (commerceFailed) console.error('FAIL marketplace provider configuration is incomplete.');
  if (checkoutFailed) console.error('FAIL marketplace checkout configuration is incomplete.');
  if (automaticFulfillmentFailed) console.error('FAIL automatic merchandise fulfillment is incomplete.');
  if (performanceFailed) console.error(`FAIL marketplace response exceeded ${maxLatencyMs}ms performance budget.`);
  process.exitCode = 1;
} else {
  console.log(`PASS marketplace deployment verified at ${baseUrl}`);
}
