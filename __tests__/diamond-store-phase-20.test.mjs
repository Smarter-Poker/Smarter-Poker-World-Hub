import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

test('client-only storefront header reserves the approved artwork footprint before hydration', async () => {
  const [store, shell] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('src/components/diamond-store/DiamondStoreShell.module.css'),
  ]);
  assert.match(store, /className=\{shellStyles\.globalHeaderReserve\}/);
  assert.match(store, /data-marketplace-header-reserve="true"/);
  assert.match(shell, /\.globalHeaderReserve/);
  assert.match(shell, /aspect-ratio:\s*1648 \/ 168/);
  assert.match(shell, /global-header-desktop\.png/);
  assert.match(shell, /position:\s*sticky/);
});

test('Club Shop administration uses one guarded accessible delete dialog', async () => {
  const store = await read('pages/hub/diamond-store.js');
  assert.doesNotMatch(store, /\b(?:window\.)?confirm\s*\(/);
  assert.match(store, /clubShopAdminActionRef\.current/);
  assert.match(store, /if \(!item\?\.id \|\| !item\?\.club_id \|\| clubShopAdminActionRef\.current\) return/);
  assert.match(store, /setClubShopDeleteTarget\(item\)/);
  assert.match(store, /ref=\{clubShopDeleteDialogRef\}/);
  assert.match(store, /aria-labelledby="club-shop-delete-title"/);
  assert.match(store, /aria-describedby="club-shop-delete-description"/);
  assert.match(store, /useDialogFocus\(\s*!!clubShopDeleteTarget/);
  assert.match(store, /Items With Purchase History Cannot Be Deleted/);
  assert.match(store, /minHeight:\s*44/);
});

test('Club Shop admin mutations refresh both operator and shopper views without silent telemetry loss', async () => {
  const [store, api] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('pages/api/club-arena/shop-items.js'),
  ]);
  assert.match(store, /await Promise\.all\(\[loadClubShopAdmin\(\), loadClubShop\(true\)\]\)/);
  assert.match(store, /handleClubShopAdminAction\('toggle', item\)/);
  assert.match(store, /handleClubShopAdminAction\('delete', clubShopDeleteTarget\)/);
  assert.doesNotMatch(api, /catch \([^)]*\) \{\}/);
  assert.match(api, /error reporting failed/);
});

test('both Club Shop admin APIs enforce the one platform-owned all-throwables offer', async () => {
  const [rules, manageShop, shopItems] = await Promise.all([
    read('src/lib/club-arena/shopItemRules.js'),
    read('pages/api/club-arena/manage-shop.js'),
    read('pages/api/club-arena/shop-items.js'),
  ]);

  assert.match(rules, /ALL_THROWABLES_NAME\s*=\s*'All Throwables Pack \(10\)'/);
  assert.match(rules, /ALL_THROWABLES_GRANT_SPEC\s*=\s*Object\.freeze\(\{ type: 'throwable', qty: 10 \}\)/);
  assert.match(rules, /function enforceAllThrowablesMutation/);
  assert.match(rules, /action === 'create' && requestedAsThrowable/);
  assert.match(rules, /action === 'toggle' \|\| action === 'delete'/);

  for (const route of [manageShop, shopItems]) {
    assert.match(route, /enforceAllThrowablesMutation/);
    assert.match(route, /enforceAllThrowablesMutation\('create', req\.body\)/);
    assert.match(route, /enforceAllThrowablesMutation\('update', req\.body, existingItem\)/);
    assert.match(route, /enforceAllThrowablesMutation\('toggle', req\.body,/);
    assert.match(route, /enforceAllThrowablesMutation\('delete', req\.body,/);
    assert.match(route, /code: throwableGuard\.code/);
    assert.match(route, /select\('name, description, category, item_type, grant_spec, image_url, is_active, stackable, per_user_limit, price, sale_price'\)/);
  }
});

test('Phase 20 is part of the compact Vercel marketplace release contract', async () => {
  const [pkg, ignore, e2e] = await Promise.all([
    read('package.json'),
    read('.vercelignore'),
    read('e2e/05-diamond-store.spec.ts'),
  ]);
  assert.match(pkg, /__tests__\/diamond-store-phase-20\.test\.mjs/);
  assert.match(ignore, /!\/__tests__\/diamond-store-phase-20\.test\.mjs/);
  assert.match(e2e, /Club Shop operators delete through one guarded in-page dialog/);
  assert.match(e2e, /expect\(deleteRequests\)\.toBe\(1\)/);
});
