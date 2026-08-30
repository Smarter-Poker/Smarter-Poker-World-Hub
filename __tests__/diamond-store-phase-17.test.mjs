import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');
const require = createRequire(import.meta.url);
const readiness = require('../src/lib/store/marketplaceReadiness.js');

test('readiness retries transient failures and avoids full-table exact counts', async () => {
  let attempts = 0;
  const result = await readiness.withTransientRetry(() => {
    attempts += 1;
    if (attempts === 1) throw new Error('cold connection');
    return 'healthy';
  }, { delayMs: 0 });
  assert.equal(result, 'healthy');
  assert.equal(attempts, 2);

  const source = await read('src/lib/store/marketplaceReadiness.js');
  assert.doesNotMatch(source, /count:\s*['"]exact['"]/);
  assert.match(source, /rows\.length > maxRows/);
  assert.match(source, /DEFAULT_MAX_ATTEMPTS = 2/);
});

test('catalog readiness detects its bound with one sentinel row', async () => {
  const rows = {
    merchandise_items: [
      { id: 'one', has_variants: false, metadata: {} },
      { id: 'two', has_variants: false, metadata: {} },
      { id: 'three', has_variants: false, metadata: {} },
    ],
    merchandise_item_variants: [],
  };
  const client = {
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        async range(start, end) {
          return { data: rows[table].slice(start, end + 1), error: null };
        },
      };
      return query;
    },
  };
  const result = await readiness.catalogReadiness(client, {
    resolvePrintfulMapping: () => false,
    timeoutMs: 500,
    pageSize: 2,
    maxItems: 2,
    maxVariants: 2,
  });
  assert.equal(result.reachable, true);
  assert.equal(result.complete, false);
  assert.equal(result.loaded, 2);
  assert.equal(result.total, 3);
  assert.equal(result.reason, 'catalog_health_limit_exceeded');
});

test('private checkout status authenticates before validating an opaque reference', async () => {
  const source = await read('pages/api/store/checkout-status.js');
  const auth = source.indexOf('getServerUserWithFallback(req, getSupabase())');
  const validation = source.indexOf("const sessionId = typeof req.query.session_id");
  assert.ok(auth > -1);
  assert.ok(validation > auth);
});

test('Club Shop sales burn buyer Diamonds and never create a club commission', async () => {
  const [api, migration, vercelIgnore] = await Promise.all([
    read('pages/api/club-arena/marketplace-purchase.js'),
    read('supabase/migrations/20260829130000_club_shop_atomic_purchase.sql'),
    read('.vercelignore'),
  ]);
  assert.match(api, /platform_owned_diamond_burn/);
  assert.match(api, /fn_purchase_club_shop_item_diamonds/);
  assert.match(migration, /p_user_id, -v_price, 'purchase'/);
  assert.match(migration, /INSERT INTO public\.club_shop_purchases/);
  const purchaseFunction = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.fn_purchase_club_shop_item_diamonds'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.fn_redeem_shop_item')
  );
  assert.doesNotMatch(purchaseFunction, /commission|revenue_share|club_owner|affiliate|payout/i);
  assert.match(vercelIgnore, /!\/supabase\/migrations\/20260829130000_club_shop_atomic_purchase\.sql/);
});

test('deployment verification covers every account subpage and purchase authorization boundary', async () => {
  const verifier = await read('scripts/verify-marketplace-deployment.mjs');
  for (const marker of [
    '/hub/diamond-store/cart',
    '/hub/diamond-store/orders',
    '/hub/diamond-store/wishlist',
    '/hub/merch-store/fulfillment',
    '/api/store/checkout-status?session_id=invalid',
    '/api/store/purchase-with-diamonds',
    '/api/store/purchase-vip-with-diamonds',
    '/api/club-arena/marketplace-purchase',
    '/api/store/merch-catalog?limit=100',
  ]) assert.ok(verifier.includes(marker), `missing deployment probe: ${marker}`);
  assert.match(verifier, /--require-performance/);
  assert.match(verifier, /MARKETPLACE_MAX_LATENCY_MS/);
});

test('marketplace detail media is an in-page, keyboard-dismissible gallery', async () => {
  const [detail, css, product] = await Promise.all([
    read('src/components/store/MarketplaceDetailExperience.jsx'),
    read('src/components/store/MarketplaceDetailExperience.module.css'),
    read('pages/hub/merch-store/[productId].js'),
  ]);
  assert.match(detail, /role="dialog"/);
  assert.match(detail, /event\.key === 'Escape'/);
  assert.match(detail, /galleryImages/);
  assert.match(detail, /fetchpriority="high"/);
  assert.doesNotMatch(detail, /fetchPriority=/);
  assert.doesNotMatch(detail, /target=["']_blank["']/);
  assert.match(css, /\.mediaDialog/);
  assert.match(product, /metadata\.gallery_images/);
  assert.match(product, /galleryImages=\{galleryImages\}/);
});
