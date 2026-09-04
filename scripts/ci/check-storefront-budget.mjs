import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, '.next/build-manifest.json'), 'utf8'));
const routes = [
  '/hub/diamond-store',
  '/hub/vip-membership',
  '/hub/merch-store',
  '/hub/smarter-rewards',
  '/hub/club-shop',
];
const MAX_INITIAL_RAW_BYTES = 1_150_000;
const MAX_ROUTE_HERO_BYTES = 100 * 1024;

let failed = false;
for (const route of routes) {
  const files = manifest.pages?.[route] || [];
  const bytes = files.reduce((total, file) => {
    try {
      return total + statSync(join(root, '.next', file)).size;
    } catch {
      return total;
    }
  }, 0);
  console.log(`${route}: ${bytes.toLocaleString()} Raw Initial Bytes`);
  if (!files.length || bytes > MAX_INITIAL_RAW_BYTES) {
    console.error(`${route} Exceeds The ${MAX_INITIAL_RAW_BYTES.toLocaleString()}-Byte Storefront Budget`);
    failed = true;
  }
}

for (const asset of ['vip-hero.webp', 'merch-hero.webp', 'rewards-hero.webp', 'club-shop-hero.webp']) {
  const bytes = statSync(join(root, 'public/images/store-v3', asset)).size;
  console.log(`${asset}: ${bytes.toLocaleString()} Bytes`);
  if (bytes > MAX_ROUTE_HERO_BYTES) {
    console.error(`${asset} Exceeds The ${MAX_ROUTE_HERO_BYTES.toLocaleString()}-Byte Hero Budget`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Storefront Performance Budgets Passed');
