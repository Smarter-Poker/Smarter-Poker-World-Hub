#!/usr/bin/env node

const args = process.argv.slice(2);
const requireCommerce = args.includes('--require-commerce');
const requireCheckout = args.includes('--require-checkout');
const requirePerformance = args.includes('--require-performance');
const suppliedBase = args.find((arg) => !arg.startsWith('--'));
const baseUrl = String(suppliedBase || process.env.MARKETPLACE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const timeoutMs = Math.max(1_000, Number(process.env.MARKETPLACE_PROBE_TIMEOUT_MS) || 15_000);
const maxLatencyMs = Math.max(1_000, Number(process.env.MARKETPLACE_MAX_LATENCY_MS) || 8_000);
const bypassSecret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();

function requestHeaders(extra = {}) {
  return {
    'User-Agent': 'SmarterPoker-Marketplace-Readiness/1.1',
    ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
    ...extra,
  };
}

const routes = [
  { path: '/hub/diamond-store' },
  { path: '/hub/vip-membership' },
  { path: '/hub/vip-membership/compare' },
  { path: '/hub/vip-membership/manage', marker: 'VIP Command Center' },
  { path: '/hub/merch-store' },
  { path: '/hub/merch-store/hoodie-neural' },
  { path: '/hub/merch-store/fulfillment', marker: 'Fulfillment Command Vault' },
  { path: '/hub/diamond-store/cart', marker: 'Shopping Cart — Diamond Store' },
  { path: '/hub/diamond-store/orders', marker: 'Order History' },
  { path: '/hub/diamond-store/wishlist', marker: 'Wishlist' },
  { path: '/hub/diamond-store/orders/phase-11-proof?source=merchandise' },
  { path: '/hub/smarter-rewards' },
  { path: '/hub/smarter-rewards/daily_login', marker: 'Verified Reward Telemetry' },
  { path: '/hub/club-shop' },
];
const assets = [
  '/images/store-v3/diamond-vault-hero.webp',
  '/images/store-v3/vip-hero.webp',
  '/images/store-v3/merch-hero.webp',
  '/images/store-v3/rewards-hero.webp',
  '/images/store-v3/club-shop-hero.webp',
];

async function probe(path, expectedType, marker = '') {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'follow',
      headers: requestHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = response.headers.get('content-type') || '';
    const body = marker ? await response.text() : '';
    const okay = response.ok
      && (!expectedType || contentType.includes(expectedType))
      && (!marker || body.includes(marker));
    const reason = !response.ok
      ? `http_${response.status}`
      : expectedType && !contentType.includes(expectedType)
        ? 'unexpected_content_type'
        : marker && !body.includes(marker)
          ? 'missing_marker'
          : null;
    return { path, okay, status: response.status, contentType, reason, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      path,
      okay: false,
      status: 0,
      contentType: '',
      reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function probePrivate({ path: privatePath, method = 'GET' }) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${privatePath}`, {
      method,
      headers: requestHeaders({
        Accept: 'application/json',
        Origin: baseUrl,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      }),
      ...(method === 'POST' ? { body: '{}' } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      path: method === 'GET'
        ? `${privatePath} (private)`
        : `${privatePath} (${method.toLowerCase()}, private)`,
      okay: response.status === 401,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      reason: response.status === 401 ? null : `expected_401_received_${response.status}`,
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
      latencyMs: Date.now() - startedAt,
    };
  }
}

const results = await Promise.all([
  ...routes.map((route) => probe(route.path, 'text/html', route.marker)),
  ...assets.map((path) => probe(path, 'image/')),
]);

results.push(...await Promise.all([
  probePrivate({ path: '/api/store/vip-membership-status' }),
  probePrivate({ path: '/api/store/order-ledger' }),
  probePrivate({ path: '/api/store/checkout-status?session_id=invalid' }),
  probePrivate({ path: '/api/store/purchase-with-diamonds', method: 'POST' }),
  probePrivate({ path: '/api/store/purchase-vip-with-diamonds', method: 'POST' }),
  probePrivate({ path: '/api/club-arena/marketplace-purchase', method: 'POST' }),
]));

try {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/store/merch-catalog?limit=100`, {
    headers: requestHeaders({ Accept: 'application/json' }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : Array.isArray(body?.data?.items) ? body.data.items : [];
  results.push({
    path: '/api/store/merch-catalog',
    okay: response.ok && items.length > 0,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    reason: !response.ok ? `http_${response.status}` : items.length === 0 ? 'empty_catalog' : null,
    latencyMs: Date.now() - startedAt,
  });
} catch (error) {
  results.push({
    path: '/api/store/merch-catalog',
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
    headers: requestHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  try {
    readiness = JSON.parse(body);
  } catch (_) {
    readiness = null;
  }
  const okay = response.ok && contentType.includes('application/json') && readiness?.success === true;
  results.push({
    path: '/api/store/readiness',
    okay,
    status: response.status,
    contentType,
    reason: !response.ok
      ? `http_${response.status}`
      : !contentType.includes('application/json') || !readiness
        ? 'invalid_json_response'
        : readiness?.success !== true
          ? 'unhealthy_response'
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

for (const result of results) {
  const signal = result.okay ? 'PASS' : 'FAIL';
  const diagnostic = result.reason ? ` (${result.reason})` : '';
  const latency = Number.isFinite(result.latencyMs) ? ` [${result.latencyMs}ms]` : '';
  console.log(`${signal.padEnd(4)} ${String(result.status).padEnd(3)} ${result.path}${diagnostic}${latency}`);
}
if (readiness?.checks) console.log(`Commerce capabilities: ${JSON.stringify(readiness.checks)}`);
if (readiness?.capabilities) console.log(`Checkout capabilities: ${JSON.stringify(readiness.capabilities)}`);
if (readiness?.capabilities) {
  console.log(`Automatic merchandise fulfillment: ${readiness.capabilities.automaticMerchFulfillment === true ? 'ready' : 'deferred'}`);
}

const surfaceFailed = results.some((result) => !result.okay);
const commerceFailed = requireCommerce && readiness?.ready !== true;
const checkoutFailed = requireCheckout && !(
  readiness?.capabilities?.cardCheckout === true
  && readiness?.capabilities?.diamondCheckout === true
);
const performanceFailed = requirePerformance && results.some(
  (result) => result.okay && Number.isFinite(result.latencyMs) && result.latencyMs > maxLatencyMs
);
if (surfaceFailed || commerceFailed || checkoutFailed || performanceFailed) {
  if (commerceFailed) console.error('FAIL marketplace provider configuration is incomplete.');
  if (checkoutFailed) console.error('FAIL marketplace checkout configuration is incomplete.');
  if (performanceFailed) console.error(`FAIL marketplace response exceeded ${maxLatencyMs}ms performance budget.`);
  process.exitCode = 1;
} else {
  console.log(`PASS marketplace deployment verified at ${baseUrl}`);
}
