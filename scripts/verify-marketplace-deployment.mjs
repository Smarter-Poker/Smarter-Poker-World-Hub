#!/usr/bin/env node

const args = process.argv.slice(2);
const requireCommerce = args.includes('--require-commerce');
const suppliedBase = args.find((arg) => !arg.startsWith('--'));
const baseUrl = String(suppliedBase || process.env.MARKETPLACE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const routes = [
  '/hub/diamond-store',
  '/hub/vip-membership',
  '/hub/vip-membership/compare',
  '/hub/vip-membership/manage',
  '/hub/merch-store',
  '/hub/merch-store/hoodie-neural',
  '/hub/diamond-store/orders/phase-11-proof?source=merchandise',
  '/hub/smarter-rewards',
  '/hub/club-shop',
];
const assets = [
  '/images/store-v3/diamond-vault-hero.webp',
  '/images/store-v3/vip-hero.webp',
  '/images/store-v3/merch-hero.webp',
  '/images/store-v3/rewards-hero.webp',
  '/images/store-v3/club-shop-hero.webp',
];

async function probe(path, expectedType) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'follow',
    headers: { 'User-Agent': 'SmarterPoker-Marketplace-Readiness/1.0' },
  });
  const contentType = response.headers.get('content-type') || '';
  const okay = response.ok && (!expectedType || contentType.includes(expectedType));
  return { path, okay, status: response.status, contentType };
}

const results = [];
for (const path of routes) results.push(await probe(path, 'text/html'));
for (const path of assets) results.push(await probe(path, 'image/'));

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

const surfaceFailed = results.some((result) => !result.okay);
const commerceFailed = requireCommerce && readiness?.ready !== true;
if (surfaceFailed || commerceFailed) {
  if (commerceFailed) console.error('FAIL marketplace provider configuration is incomplete.');
  process.exitCode = 1;
} else {
  console.log(`PASS marketplace deployment verified at ${baseUrl}`);
}
