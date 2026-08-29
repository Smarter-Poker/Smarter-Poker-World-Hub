#!/usr/bin/env node

const args = process.argv.slice(2);
const requireCommerce = args.includes('--require-commerce');
const requireCheckout = args.includes('--require-checkout');
const suppliedBase = args.find((arg) => !arg.startsWith('--'));
const baseUrl = String(suppliedBase || process.env.MARKETPLACE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

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
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'follow',
    headers: { 'User-Agent': 'SmarterPoker-Marketplace-Readiness/1.0' },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = marker ? await response.text() : '';
  const okay = response.ok
    && (!expectedType || contentType.includes(expectedType))
    && (!marker || body.includes(marker));
  return { path, okay, status: response.status, contentType };
}

const results = [];
for (const route of routes) results.push(await probe(route.path, 'text/html', route.marker));
for (const path of assets) results.push(await probe(path, 'image/'));

try {
  const response = await fetch(`${baseUrl}/api/store/vip-membership-status`, {
    headers: { Accept: 'application/json' },
  });
  results.push({
    path: '/api/store/vip-membership-status (private)',
    okay: response.status === 401,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
  });
} catch (error) {
  results.push({ path: '/api/store/vip-membership-status (private)', okay: false, status: 0, contentType: error.message });
}

let readiness = null;
try {
  const response = await fetch(`${baseUrl}/api/store/readiness`, { headers: { Accept: 'application/json' } });
  readiness = await response.json();
  results.push({ path: '/api/store/readiness', okay: response.ok && readiness?.success === true, status: response.status, contentType: 'application/json' });
} catch (error) {
  results.push({ path: '/api/store/readiness', okay: false, status: 0, contentType: error.message });
}

for (const result of results) {
  const signal = result.okay ? 'PASS' : 'FAIL';
  console.log(`${signal.padEnd(4)} ${String(result.status).padEnd(3)} ${result.path}`);
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
