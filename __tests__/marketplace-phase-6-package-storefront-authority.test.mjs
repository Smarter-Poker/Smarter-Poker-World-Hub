import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  normalizeDiamondPackageRows,
  resolveDiamondPackage,
} from '../src/lib/store/diamondPackageCatalog.mjs';
import {
  loadDiamondStorefrontPackages,
  projectDiamondStorefrontPackages,
  sameDiamondStorefrontOffer,
} from '../src/lib/store/diamondStorefrontCatalog.mjs';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

function packageRows() {
  return [
    {
      package_key: 'micro',
      display_name: 'micro casino\u2014vault',
      diamonds: 150,
      bonus_diamonds: 25,
      price_usd: '1.25',
      active: true,
    },
    {
      package_key: 'ultra',
      display_name: 'ultra stack',
      diamonds: 80000,
      bonus_diamonds: 4000,
      price_usd: '725.00',
      active: true,
    },
  ];
}

test('one normalized database row drives display, submission, and Stripe cents', () => {
  const catalog = normalizeDiamondPackageRows(packageRows());
  const displayed = projectDiamondStorefrontPackages(catalog);
  const offer = displayed.find(pkg => pkg.id === 'micro');
  const charged = resolveDiamondPackage({ packageId: offer.id }, catalog);

  assert.deepEqual(
    {
      id: offer.id,
      diamonds: offer.diamonds,
      bonus: offer.bonus,
      priceCents: offer.priceCents,
    },
    {
      id: charged.key,
      diamonds: charged.diamonds,
      bonus: charged.bonus,
      priceCents: charged.priceCents,
    }
  );
  assert.equal(offer.name, 'Micro Casino: Vault');
  assert.doesNotMatch(offer.name, /[\u2013\u2014]/u);
  assert.equal(offer.price, 1.25);
  assert.equal(sameDiamondStorefrontOffer(offer, { ...offer }), true);
  assert.equal(sameDiamondStorefrontOffer(offer, { ...offer, priceCents: 126 }), false);
});

test('active database additions and removals replace rather than merge with fallback offers', async () => {
  const rows = packageRows().slice(1);
  const supabase = {
    from(table) {
      assert.equal(table, 'diamond_packages');
      return {
        select(columns) {
          assert.match(columns, /package_key/);
          return this;
        },
        async eq(column, value) {
          assert.equal(column, 'active');
          assert.equal(value, true);
          return { data: rows, error: null };
        },
      };
    },
  };

  const result = await loadDiamondStorefrontPackages(supabase, {
    allowFallback: false,
    cacheMs: 0,
  });
  assert.equal(result.source, 'database');
  assert.deepEqual(result.packages.map(pkg => pkg.id), ['ultra']);
  assert.equal(result.packages[0].priceCents, 72500);
  assert.equal(Object.hasOwn(result.packages[0], 'priceUsd'), false);
  assert.equal(Object.hasOwn(result, 'supabase'), false);
});

test('Diamond Store uses current server catalog and requires review after offer drift', async () => {
  const [page, catalogApi, showcase] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('pages/api/club-arena/store-catalog.js'),
    read('src/components/diamond-store/SmarterStoreShowcase.jsx'),
  ]);

  assert.match(page, /export async function getServerSideProps/);
  assert.match(page, /loadDiamondStorefrontPackages\(createClient\(url, key\)/);
  assert.match(page, /initialDiamondCatalogSource/);
  assert.match(page, /\/api\/club-arena\/store-catalog\?strict=true/);
  assert.match(page, /sameDiamondStorefrontOffer\(pkg, currentPackage\)/);
  assert.match(page, /Package Details Changed\. Review The Current Offer Before Purchasing\./);
  assert.match(page, /packages=\{diamondPackages\}/);
  assert.doesNotMatch(page, /packages=\{DIAMOND_PACKAGES\}/);

  assert.match(catalogApi, /loadDiamondStorefrontPackages\(getSupabase\(\)/);
  assert.match(catalogApi, /allowFallback: !strict/);
  assert.match(catalogApi, /cacheMs: strict \? 0 : undefined/);
  assert.match(catalogApi, /diamondCatalogSource: diamondCatalog\.source/);
  assert.match(catalogApi, /Cache-Control', 'public, no-store, max-age=0'/);
  assert.doesNotMatch(catalogApi, /const DIAMOND_PACKAGES = \[/);

  assert.match(showcase, /catalogState === 'database'/);
  assert.match(showcase, /Current Pricing Verified/);
  assert.match(showcase, /Current Pricing Unavailable/);
  assert.match(showcase, /disabled=\{isProcessing \|\| catalogState !== 'database'\}/);
});
