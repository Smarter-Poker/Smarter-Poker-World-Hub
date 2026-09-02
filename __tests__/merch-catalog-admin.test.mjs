import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

const NEW_WEARABLES = [
  'ice-orbit-snapback',
  'river-signal-trucker-hat',
  'midnight-circuit-beanie',
  'dead-money-detector-tee',
  'range-architect-tee',
  'all-in-after-dark-tee',
  'no-free-cards-tee',
  'cold-four-bet-hoodie',
  'final-table-voltage-hoodie',
  'stack-pressure-zip-hoodie',
];

const NEW_NON_WEARABLES = [
  'river-read-sunglasses.webp',
  'final-table-mirror-sunglasses.webp',
  'tournament-wire-tumbler.webp',
  'neural-steel-card-protector.webp',
  'circuit-breaker-deck.webp',
  'range-grid-desk-mat.webp',
  'vault-cut-poker-towel.webp',
];

test('Collection 02 seeds at least ten new wearable designs and non-wearable categories', async () => {
  const migration = await read('supabase/migrations/20260828010000_neural_steel_catalog_expansion.sql');
  for (const id of NEW_WEARABLES) assert.match(migration, new RegExp(`'${id}'`));
  assert.match(migration, /'eyewear'/);
  assert.match(migration, /'tabletop'/);
  assert.match(migration, /'lifestyle'/);
  assert.match(migration, /provider_pending/);
  assert.match(migration, /mapping_required/);
  assert.doesNotMatch(migration, /sync_variant_id\s*["']?\s*:\s*[1-9]/);
});

test('all Collection 02 storefront assets exist and stay lightweight', async () => {
  const migration = await read('supabase/migrations/20260828010000_neural_steel_catalog_expansion.sql');
  const assetNames = [...NEW_WEARABLES.map(id => `${id}.webp`), ...NEW_NON_WEARABLES];
  for (const name of assetNames) {
    const url = new URL(`public/images/merch/neural-steel/collection-02/${name}`, ROOT);
    await access(url);
    const info = await stat(url);
    assert.ok(info.size > 10_000, `${name} should contain a real product image`);
    assert.ok(info.size < 180_000, `${name} should be optimized below 180 KB`);
    assert.match(migration, new RegExp(name.replaceAll('.', '\\.')));
  }
});

test('merchandise admin endpoint is platform-admin-only and never hard-deletes catalog rows', async () => {
  const api = await read('pages/api/horses/merch-catalog-admin.js');
  // Phase 1 moved the auth, the role literal, the service-role client and the
  // audit write out of this route and into
  // src/lib/horses/{operatorRoute,operatorAuth,permissions,operatorAudit}.
  // The guarantees the test exists to pin are unchanged; the names are not, so
  // the ones that moved are asserted where they now live.
  const auth = await read('src/lib/horses/operatorAuth.js');
  assert.match(api, /withOperatorRoute/);
  assert.match(auth, /SUPABASE_SERVICE_ROLE_KEY is required for the operator console/);
  assert.match(api, /PERMISSIONS\.CATALOG_WRITE/);
  // The rate limit is declared in the spec now instead of applied inline, but
  // it is still the write bucket on every mutating method.
  assert.match(api, /limit: \{ GET: 'read', POST: 'write', PATCH: 'write', DELETE: 'write' \}/);
  assert.match(api, /is_active: false/);
  assert.match(api, /auditOperatorAction/);
  assert.match(api, /resolvePrintfulMapping/);
  assert.doesNotMatch(api, /from\(table\)\.delete\(/);
});

test('Stable Admin and storefront are wired to the editable expanded catalog', async () => {
  const [horses, admin, store, fallback, checkout] = await Promise.all([
    read('pages/horses/index.js'),
    read('src/components/admin/MerchCatalogAdmin.jsx'),
    read('src/components/store/MerchStore.jsx'),
    read('src/data/diamondStoreData.js'),
    read('pages/api/store/create-checkout-session.js'),
  ]);
  assert.match(horses, /id: 'merch', label: 'Merch Catalog'/);
  assert.match(horses, /<MerchCatalogAdmin authFetch=\{authFetch\}/);
  assert.match(admin, /\/api\/horses\/merch-catalog-admin/);
  assert.match(admin, /Archive Product/);
  assert.match(admin, /Printful Sync Variant ID/);
  assert.match(admin, /function ProductThumbnail/);
  assert.match(admin, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(store, /headwear: 'Hats And Headwear'/);
  assert.match(store, /eyewear: 'Sunglasses'/);
  assert.match(store, /tabletop: 'Poker Table Gear'/);
  for (const id of NEW_WEARABLES) assert.match(fallback, new RegExp(`id: '${id}'`));
  assert.match(checkout, /fulfillmentMode: automaticFulfillment \? 'automatic' : 'manual'/);
  assert.match(checkout, /catalogProvider/);
  assert.doesNotMatch(checkout, /FULFILLMENT_NOT_CONFIGURED/);
});
