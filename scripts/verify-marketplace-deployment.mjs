#!/usr/bin/env node

const args = process.argv.slice(2);
const requireCommerce = args.includes('--require-commerce');
const requireCheckout = args.includes('--require-checkout');
const suppliedBase = args.find((arg) => !arg.startsWith('--'));
const baseUrl = String(suppliedBase || process.env.MARKETPLACE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const timeoutMs = Math.max(1_000, Number(process.env.MARKETPLACE_PROBE_TIMEOUT_MS) || 15_000);
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
    return { path, okay, status: response.status, contentType, reason };
  } catch (error) {
    return {
      path,
      okay: false,
      status: 0,
      contentType: '',
      reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
    };
  }
}

const results = await Promise.all([
  ...routes.map((route) => probe(route.path, 'text/html', route.marker)),
  ...assets.map((path) => probe(path, 'image/')),
]);

try {
  const response = await fetch(`${baseUrl}/api/store/vip-membership-status`, {
    headers: requestHeaders({ Accept: 'application/json' }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  results.push({
    path: '/api/store/vip-membership-status (private)',
    okay: response.status === 401,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    reason: response.status === 401 ? null : `expected_401_received_${response.status}`,
  });
} catch (error) {
  results.push({
    path: '/api/store/vip-membership-status (private)',
    okay: false,
    status: 0,
    contentType: '',
    reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
  });
}

let readiness = null;
try {
  const response = await fetch(`${baseUrl}/api/store/readiness`, {
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
  });
} catch (error) {
  results.push({
    path: '/api/store/readiness',
    okay: false,
    status: 0,
    contentType: '',
    reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
  });
}

for (const result of results) {
  const signal = result.okay ? 'PASS' : 'FAIL';
  const diagnostic = result.reason ? ` (${result.reason})` : '';
  console.log(`${signal.padEnd(4)} ${String(result.status).padEnd(3)} ${result.path}${diagnostic}`);
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
if (surfaceFailed || commerceFailed || checkoutFailed) {
  if (commerceFailed) console.error('FAIL marketplace provider configuration is incomplete.');
  if (checkoutFailed) console.error('FAIL marketplace checkout configuration is incomplete.');
  process.exitCode = 1;
} else {
  console.log(`PASS marketplace deployment verified at ${baseUrl}`);
}
