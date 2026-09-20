import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

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

test('Club Shop account markup stays server-identical until browser hydration completes', async () => {
  const store = await read('pages/hub/diamond-store.js');
  assert.match(store, /const \[storeClientReady, setStoreClientReady\] = useState\(false\)/);
  assert.match(store, /useEffect\(\(\) => \{\s*setStoreClientReady\(true\);\s*\}, \[\]\)/);
  assert.match(
    store,
    /const committedStoreAccountId = storeClientReady\s*\? contextUser\?\.id \|\| \(authInitializing \? user\?\.id \|\| getAuthUser\(\)\?\.id \|\| null : null\)\s*: null/
  );
  assert.match(store, /const clubShopAuthPending = !storeClientReady \|\| authInitializing/);
  const pendingIndex = store.indexOf('{clubShopAuthPending ? (');
  const signedOutIndex = store.indexOf(': !committedStoreAccountId ? (');
  assert.ok(pendingIndex >= 0, 'the hydration-stable loading branch must remain rendered');
  assert.ok(
    signedOutIndex > pendingIndex,
    'the hydration-stable loading branch must run before signed-in versus signed-out markup'
  );
});

test('Club Shop administration uses one guarded accessible delete dialog', async () => {
  const store = await read('pages/hub/diamond-store.js');
  assert.doesNotMatch(store, /\b(?:window\.)?confirm\s*\(/);
  assert.match(store, /clubShopAdminActionRef\.current/);
  assert.match(
    store,
    /if \(!item\?\.id \|\| !item\?\.club_id \|\| clubShopAdminActionRef\.current\) return/
  );
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

test('both Club Shop writers fail closed on category and create repeatable consumables', async () => {
  const [store, manageShop, shopItems] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('pages/api/club-arena/manage-shop.js'),
    read('pages/api/club-arena/shop-items.js'),
  ]);
  for (const route of [manageShop, shopItems]) {
    assert.match(route, /normalizePurchaseCategory\(category\)/);
    assert.match(route, /stackable:\s*true|const stackable = true/);
    assert.match(route, /select\('[^']*grant_spec, is_active, stackable, price'\)/);
  }
  assert.match(store, /aria-label="Time Bank Uses Delivered"/);
  assert.match(store, /grantType:\s*'time_bank'/);
  assert.match(store, /grantQty,/);
  assert.match(store, /stackable:\s*true/);
});

test('Club Shop deletion cannot continue after an unverified purchase-history read', async () => {
  const [rules, manageShop, shopItems] = await Promise.all([
    read('src/lib/club-arena/shopItemRules.js'),
    read('pages/api/club-arena/manage-shop.js'),
    read('pages/api/club-arena/shop-items.js'),
  ]);
  assert.match(rules, /if \(error \|\| !Array\.isArray\(data\)\)/);
  assert.match(rules, /PURCHASE_HISTORY_VERIFICATION_FAILED/);
  assert.match(rules, /throw verificationError/);
  for (const route of [manageShop, shopItems]) {
    const guard = route.indexOf('await itemHasSales');
    const deletion = route.indexOf(".from('club_shop_items')\n", guard);
    assert.ok(guard >= 0, 'delete route must verify history');
    assert.ok(
      deletion > guard,
      'hard delete must remain unreachable until history verification returns'
    );
  }
});

test('both Club Shop admin APIs enforce the one platform-owned all-throwables offer', async () => {
  const [rules, manageShop, shopItems] = await Promise.all([
    read('src/lib/club-arena/shopItemRules.js'),
    read('pages/api/club-arena/manage-shop.js'),
    read('pages/api/club-arena/shop-items.js'),
  ]);

  assert.match(rules, /ALL_THROWABLES_NAME\s*=\s*'All Throwables Pack \(10\)'/);
  assert.match(
    rules,
    /ALL_THROWABLES_GRANT_SPEC\s*=\s*Object\.freeze\(\{ type: 'throwable', qty: 10 \}\)/
  );
  assert.match(rules, /function enforceAllThrowablesMutation/);
  assert.match(rules, /action === 'create' && \(requestedAsThrowable \|\| requestedReservedName\)/);
  assert.match(rules, /action === 'toggle' \|\| action === 'delete'/);

  for (const route of [manageShop, shopItems]) {
    assert.match(route, /enforceAllThrowablesMutation/);
    assert.match(route, /enforceAllThrowablesMutation\('create', req\.body\)/);
    assert.match(route, /enforceAllThrowablesMutation\('update', req\.body, existingItem\)/);
    assert.match(route, /enforceAllThrowablesMutation\('toggle', req\.body,/);
    assert.match(route, /enforceAllThrowablesMutation\('delete', req\.body,/);
    assert.match(route, /code: throwableGuard\.code/);
    assert.match(
      route,
      /select\(\s*'name, description, category, item_type, grant_spec, image_url, is_active, stackable, per_user_limit, price, sale_price'\s*\)/
    );
  }
});

test('every paid Club Shop path fails closed without a category-matched digital grant', async () => {
  const [rules, manageShop, shopItems, items, purchase, cardCheckout, catalog] = await Promise.all([
    read('src/lib/club-arena/shopItemRules.js'),
    read('pages/api/club-arena/manage-shop.js'),
    read('pages/api/club-arena/shop-items.js'),
    read('pages/api/club-arena/marketplace-items.js'),
    read('pages/api/club-arena/marketplace-purchase.js'),
    read('pages/api/store/create-checkout-session.js'),
    read('pages/api/club-arena/store-catalog.js'),
  ]);

  assert.match(rules, /function isDeliverableShopItem/);
  assert.match(rules, /PURCHASE_ENABLED_CATEGORIES/);
  assert.match(rules, /item\?\.item_type !== expectedItemType/);
  assert.match(rules, /function enforceFulfillableMutation/);
  assert.match(rules, /type !== expectedType/);
  assert.match(rules, /item\?\.stackable !== true/);
  for (const adminRoute of [manageShop, shopItems]) {
    assert.match(adminRoute, /enforceFulfillableMutation\('update'/);
    assert.match(adminRoute, /enforceFulfillableMutation\('toggle'/);
    assert.match(adminRoute, /const fulfillmentBase = throwableGuard\.managed/);
    assert.match(adminRoute, /\{ \.\.\.existingItem, \.\.\.throwableGuard\.updates \}/);
    assert.match(adminRoute, /enforceFulfillableMutation\('update', req\.body, fulfillmentBase\)/);
  }
  for (const buyerRoute of [items, purchase, cardCheckout]) {
    assert.match(buyerRoute, /isDeliverableShopItem/);
  }
  assert.match(
    purchase,
    /\.select\('name, category, item_type, grant_spec, is_active, stackable'\)/
  );
  assert.match(
    cardCheckout,
    /\.select\('name, category, item_type, grant_spec, is_active, stackable'\)/
  );
  for (const disabledCategory of ['Table Skins', 'Emotes', 'Avatars', 'Exclusive']) {
    assert.doesNotMatch(
      catalog.match(/const SHOP_CATEGORIES = \[([\s\S]*?)\];/)?.[1] || '',
      new RegExp(disabledCategory)
    );
  }
  assert.match(items, /\.filter\(isDeliverableShopItem\)/);
  assert.match(items, /const MAX_ACTIVE_SHOP_ITEMS = 500/);
  assert.match(items, /SHOP_CATALOG_LIMIT_EXCEEDED/);
  assert.match(items, /MAX_ACTIVE_SHOP_ITEMS \+ 1/);
});

test('Club Shop admin UI cannot create, hide, delete, or split throwable offers', async () => {
  const store = await read('pages/hub/diamond-store.js');
  assert.match(store, /const CLUB_ADMIN_CREATABLE_CATEGORIES = Object\.freeze\(\[/);
  assert.doesNotMatch(
    store.match(/const CLUB_ADMIN_CREATABLE_CATEGORIES = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] ||
      '',
    /Table Skins|Throwables|Emotes|Avatars|Exclusive/
  );
  assert.match(
    store.match(/const CLUB_ADMIN_CREATABLE_CATEGORIES = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] ||
      '',
    /Time Banks/
  );
  assert.doesNotMatch(
    store.match(/aria-label="Club Shop Categories"[\s\S]*?\.map\(\(cat\)/)?.[0] || '',
    /'Exclusive'/
  );
  assert.match(store, /const isThrowableAdminItem = \(?item\)?/);
  assert.match(store, /if \(isThrowableAdminItem\(item\)\)/);
  assert.match(store, /The All Throwables Pack Is Platform Managed And Cannot Be Split/);
  assert.match(store, /\? 'Platform Managed'\s*:\s*'Historical Receipt Row'/s);
  assert.match(store, /className=\{shellStyles\.clubAdminCreateAction\}/);
  assert.match(store, /className=\{shellStyles\.clubAdminRow\}/);
  assert.match(store, /className=\{shellStyles\.clubAdminActions\}/);
});

test('Club Shop grid and item details share canonical premium product art', async () => {
  const [art, store, detail] = await Promise.all([
    read('src/lib/store/clubShopProductArt.js'),
    read('pages/hub/diamond-store.js'),
    read('pages/hub/club-shop/[itemId].js'),
  ]);
  assert.match(art, /'Time Bank \+60s': '33\.333% 0%'/);
  assert.match(art, /'Time Bank Bundle \(\+100s\)': '66\.667% 0%'/);
  assert.match(art, /'All Throwables Pack \(10\)'/);
  assert.match(store, /resolveClubShopProductArt\(item\)/);
  assert.match(detail, /resolveClubShopProductArt\(item\)/);
  assert.match(detail, /imageCropPosition=/);
});

test('canonical Club Shop art survives display-copy capitalization', async () => {
  const source = (await read('src/lib/store/clubShopProductArt.js'))
    .replace(/export function /g, 'function ')
    .replace(/export \{[^}]+\};/s, '')
    .concat('\nresolveClubShopProductArt;');
  const resolveClubShopProductArt = vm.runInNewContext(source);

  assert.deepEqual(
    {
      ...resolveClubShopProductArt({
        name: 'Time Bank +60S',
        category: 'Time Banks',
        item_type: 'time_bank',
        grant_spec: { type: 'time_bank', qty: 3 },
      }),
    },
    {
      kind: 'atlas',
      source: '/images/store-v3/club-shop-product-atlas-v2.webp',
      position: '33.333% 0%',
    }
  );
  assert.equal(
    resolveClubShopProductArt({
      name: 'Time Bank Bundle (5X)',
      category: 'Time Banks',
      item_type: 'time_bank',
      grant_spec: { type: 'time_bank', qty: 5 },
    }).kind,
    'atlas'
  );
  assert.equal(
    resolveClubShopProductArt({
      name: 'Custom Clock Pack',
      category: 'Time Banks',
      item_type: 'time_bank',
      grant_spec: { type: 'time_bank', qty: 1 },
    }).kind,
    'atlas'
  );
  assert.deepEqual(
    { ...resolveClubShopProductArt({ name: 'Unknown Avatar', category: 'Avatars' }) },
    { kind: 'unavailable', source: null, position: null }
  );
  assert.deepEqual(
    {
      ...resolveClubShopProductArt({
        name: 'All Throwables Pack (10)',
        category: 'Time Banks',
        item_type: 'time_bank',
        grant_spec: { type: 'time_bank', qty: 10 },
      }),
    },
    {
      kind: 'atlas',
      source: '/images/store-v3/club-shop-product-atlas-v2.webp',
      position: '33.333% 0%',
    }
  );
});

test('Club Shop purchase review uses the same canonical art as the selected card', async () => {
  const [store, shell] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('src/components/diamond-store/DiamondStoreShell.module.css'),
  ]);
  assert.match(store, /const clubShopBuyArt = clubShopBuyTarget/);
  assert.match(store, /resolveClubShopProductArt\(clubShopBuyTarget\)/);
  assert.match(store, /clubShopBuyArt\?\.kind === 'image'/);
  assert.match(store, /clubShopBuyArt\?\.kind === 'atlas'/);
  assert.match(store, /className=\{shellStyles\.dialogProductImage\}/);
  assert.match(store, /className=\{shellStyles\.dialogProductAtlas\}/);
  assert.match(store, /className=\{shellStyles\.dialogProductUnavailable\}/);
  assert.match(store, /productArt\.kind === 'atlas'/);
  assert.match(store, /className=\{shellStyles\.clubProductUnavailable\}/);
  assert.match(shell, /\.dialogProductMedia/);
  assert.match(shell, /\.dialogProductUnavailable/);
  assert.match(shell, /\.clubProductUnavailable/);
  assert.match(shell, /\.dialogPrimaryAction/);
  assert.match(shell, /\.dialogSecondaryAction/);
});

test('only merchandise and Club Shop products receive an inspectable product gallery', async () => {
  const [detail, merch, club, reward, compare, manage, receipt] = await Promise.all([
    read('src/components/store/MarketplaceDetailExperience.jsx'),
    read('pages/hub/merch-store/[productId].js'),
    read('pages/hub/club-shop/[itemId].js'),
    read('pages/hub/smarter-rewards/[rewardId].js'),
    read('pages/hub/vip-membership/compare.js'),
    read('pages/hub/vip-membership/manage.js'),
    read('pages/hub/diamond-store/orders/[orderId].js'),
  ]);

  assert.match(
    detail,
    /const hasProductMedia = safePresentation === 'product' && media\.length > 0/
  );
  assert.match(detail, /const socialImage =\s*safeImage && !imageCropPosition/);
  assert.match(detail, /safePresentation === 'product'[\s\S]{0,80}?\? null/);
  assert.match(detail, /\{socialImage && <meta property="og:image" content=\{socialImage\} \/>\}/);
  assert.match(detail, /content=\{socialImage \? 'summary_large_image' : 'summary'\}/);
  assert.match(detail, /presentation = 'record'/);
  assert.match(detail, /\{hasProductMedia && \(\s*<div className=\{styles\.mediaFrame\}>/);
  assert.match(detail, /if \(!hasProductMedia \|\| !mediaExpanded\) return undefined/);
  assert.match(merch, /presentation="product"/);
  assert.match(club, /presentation="product"/);
  assert.match(reward, /presentation="reward"/);
  assert.match(compare, /presentation="membership"/);
  assert.match(manage, /presentation="membership"/);
  assert.match(receipt, /presentation="record"/);
});

test('merchandise cards fail closed when reviewed product artwork is unavailable', async () => {
  const [store, css] = await Promise.all([
    read('src/components/store/MerchStore.jsx'),
    read('src/components/store/MerchStore.module.css'),
  ]);
  assert.match(store, /Product Artwork Requires Review/);
  assert.doesNotMatch(store, /src="\/images\/store-v3\/merch-hero\.webp"/);
  assert.match(css, /\.mediaUnavailable/);
});

test('merch details and wishlist reuse exact reviewed art without a generic product hero', async () => {
  const [art, detail, wishlist, experience, css] = await Promise.all([
    read('src/lib/store/merchProductArt.js'),
    read('pages/hub/merch-store/[productId].js'),
    read('pages/hub/diamond-store/wishlist.js'),
    read('src/components/store/MarketplaceDetailExperience.jsx'),
    read('src/components/store/MarketplaceDetailExperience.module.css'),
  ]);
  assert.match(art, /function resolveReviewedMerchArt/);
  assert.match(detail, /resolveReviewedMerchArt\(product\.id\)/);
  assert.match(detail, /resolveReviewedMerchArt\(item\.id\)/);
  assert.match(detail, /STATIC_DETAIL_IMAGES\[item\.id\]/);
  assert.doesNotMatch(detail, /metadata\.gallery_images/);
  assert.match(detail, /encodeURIComponent\(String\(product\.id\)\)/);
  assert.match(detail, /imageCropGrid=\{product\.imageCropPosition \? '4x1' : '4x3'\}/);
  assert.doesNotMatch(detail, /FALLBACK_IMAGE|return FALLBACK_IMAGE/);
  assert.match(wishlist, /resolveReviewedMerchArt\(String\(item\.product_id \|\| ''\)\)/);
  assert.match(wishlist, /Product Artwork Requires Review/);
  assert.doesNotMatch(wishlist, /src="\/images\/store-v3\/merch-hero\.webp"/);
  assert.match(experience, /const cropBackgroundSize = imageCropGrid === '4x1'/);
  assert.match(css, /\.spriteMedia\.spriteMediaPortrait\s*\{[^}]*aspect-ratio:\s*1 \/ 2/s);
});

test('merch detail fallback remains a preview until live catalog terms are verified', async () => {
  const [detail, store] = await Promise.all([
    read('pages/hub/merch-store/[productId].js'),
    read('src/components/store/MerchStore.jsx'),
  ]);

  assert.match(
    detail,
    /catalogVerified: false,[\s\S]{0,100}inStock: false,[\s\S]{0,100}fulfillmentReady: false/
  );
  assert.match(detail, /catalogVerified: true/);
  assert.match(detail, /product\.catalogVerified === true/);
  assert.match(detail, /Preview: Live Catalog Verification Required/);
  assert.match(store, /initialProduct\.catalogVerified === true \? 'catalog' : 'static'/);
  assert.match(store, /!initialProduct \|\| initialProduct\.catalogVerified !== true/);
  assert.match(store, /const liveAvailabilityRequired = product\.source !== 'catalog'/);
});

test('persisted cart media resolves through reviewed product identity', async () => {
  const cart = await read('pages/hub/diamond-store/cart.js');
  assert.match(cart, /resolveReviewedMerchArt\(catalogId\)/);
  assert.match(cart, /REVIEWED_NON_MERCH_CART_IMAGE_PREFIXES/);
  assert.match(cart, /backgroundPosition: media\.atlasPosition/);
  assert.doesNotMatch(cart, /src=\{image\}/);
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
