import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BUILT_IN_DIAMOND_PACKAGES,
  POSTGRES_INT4_MAX,
  STRIPE_MAX_USD_UNIT_AMOUNT_CENTS,
  STRIPE_MIN_USD_UNIT_AMOUNT_CENTS,
  canCreditDiamondWallet,
  getDiamondCheckoutTotals,
  getClubCardCheckoutQuoteFromCatalog,
  getMaximumCardFundedClubItemPrice,
  loadActiveDiamondPackageCatalog,
  normalizeDiamondPackageRows,
  parseUsdAmountToCents,
} from '../src/lib/store/diamondPackageCatalog.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const databaseRows = Object.entries(BUILT_IN_DIAMOND_PACKAGES).map(([packageKey, pkg]) => ({
  package_key: packageKey,
  display_name: pkg.name,
  diamonds: pkg.diamonds,
  bonus_diamonds: pkg.bonus,
  price_usd: pkg.price,
  active: true,
}));

function packageSupabase(result) {
  return {
    from(table) {
      assert.equal(table, 'diamond_packages');
      return {
        select() {
          return this;
        },
        eq() {
          return Promise.resolve(result);
        },
      };
    },
  };
}

test('Club Card quotes use current package credits and preserve the existing wallet', () => {
  const catalog = normalizeDiamondPackageRows(databaseRows);
  const quote = getClubCardCheckoutQuoteFromCatalog(15000, 494405, catalog);

  assert.equal(quote.cardCharge, 150);
  assert.equal(quote.cardChargeCents, 15000);
  assert.equal(quote.diamondsPurchased, 15000);
  assert.equal(quote.diamondPurchaseBalance, 479405);
  assert.equal(quote.cardPurchaseBalance, 494405);
  assert.equal(quote.diamondShortfall, 0);
  assert.ok(quote.quantity <= 10);
  assert.equal(getClubCardCheckoutQuoteFromCatalog(0, 494405, catalog), null);
  assert.equal(getClubCardCheckoutQuoteFromCatalog(15000, -1, catalog), null);
  assert.equal(
    getClubCardCheckoutQuoteFromCatalog(100, POSTGRES_INT4_MAX - 99, catalog),
    null,
    'a payable quote must never overflow the authoritative int4 wallet during settlement'
  );
  assert.equal(getClubCardCheckoutQuoteFromCatalog(525001, 494405, catalog), null);
  assert.equal(getMaximumCardFundedClubItemPrice(catalog), 525000);
});

test('Club Card quotes count package bonuses credited by atomic settlement', () => {
  const catalog = normalizeDiamondPackageRows([
    {
      package_key: 'bonus',
      display_name: 'Bonus',
      diamonds: 10000,
      bonus_diamonds: 500,
      price_usd: 100,
      active: true,
    },
  ]);
  const quote = getClubCardCheckoutQuoteFromCatalog(10001, 20, catalog);
  assert.equal(quote.quantity, 1);
  assert.equal(quote.diamondsPurchased, 10500);
  assert.equal(quote.cardPurchaseBalance, 519);
});

test('Diamond package prices use exact Stripe cents and aggregate once', () => {
  assert.equal(parseUsdAmountToCents('0.49'), null);
  assert.equal(parseUsdAmountToCents('0.50'), STRIPE_MIN_USD_UNIT_AMOUNT_CENTS);
  assert.equal(parseUsdAmountToCents('1.005'), null);
  assert.equal(parseUsdAmountToCents('19.99'), 1999);
  assert.equal(parseUsdAmountToCents('999999.99'), STRIPE_MAX_USD_UNIT_AMOUNT_CENTS);
  assert.equal(parseUsdAmountToCents('1000000.00'), null);
  assert.throws(
    () =>
      normalizeDiamondPackageRows([
        {
          package_key: 'fractional',
          display_name: 'Fractional',
          diamonds: 100,
          bonus_diamonds: 0,
          price_usd: '1.005',
        },
      ]),
    /not usable/
  );

  const catalog = normalizeDiamondPackageRows([
    {
      package_key: 'one',
      display_name: 'One',
      diamonds: 100,
      bonus_diamonds: 5,
      price_usd: '1.01',
    },
    {
      package_key: 'two',
      display_name: 'Two',
      diamonds: 250,
      bonus_diamonds: 10,
      price_usd: '2.02',
    },
  ]);
  const totals = getDiamondCheckoutTotals([
    { key: 'one', ...catalog.one, quantity: 2 },
    { key: 'two', ...catalog.two, quantity: 3 },
  ]);
  assert.deepEqual(totals, {
    diamonds: 950,
    bonus: 40,
    credit: 990,
    cardChargeCents: 808,
    cardChargeUsd: 8.08,
  });
});

test('every Diamond card purchase is rejected before Stripe when wallet credit would overflow', () => {
  assert.equal(canCreditDiamondWallet(POSTGRES_INT4_MAX - 100, 100), true);
  assert.equal(canCreditDiamondWallet(POSTGRES_INT4_MAX - 99, 100), false);
  assert.equal(canCreditDiamondWallet(-5000, 1000), true);
  assert.equal(canCreditDiamondWallet(null, 100), false);
});

test('strict package reads fail closed and fallback reads never poison strict cache', async () => {
  const unavailable = packageSupabase({ data: null, error: new Error('offline') });
  await assert.rejects(loadActiveDiamondPackageCatalog(unavailable, { cacheMs: 0 }), /offline/);
  const fallback = await loadActiveDiamondPackageCatalog(unavailable, {
    allowFallback: true,
    cacheMs: 0,
  });
  assert.equal(fallback.source, 'fallback');
  assert.equal(fallback.catalog, BUILT_IN_DIAMOND_PACKAGES);

  await assert.rejects(
    loadActiveDiamondPackageCatalog(unavailable, { cacheMs: 0 }),
    /offline/,
    'a continuity fallback must never become a trusted Club Card quote'
  );

  const current = await loadActiveDiamondPackageCatalog(
    packageSupabase({ data: databaseRows, error: null }),
    { cacheMs: 0 }
  );
  assert.equal(current.source, 'database');
  assert.equal(current.catalog.value.bonus, 500);
});

test('Club Card checkout revalidates current price, package, membership, and availability before URL reuse', async () => {
  const checkout = await read('pages/api/store/create-checkout-session.js');
  const preflightCall = checkout.indexOf(
    'redemptionIntent = await preflightClubShopCardRedemption'
  );
  const hashCall = checkout.indexOf('const checkoutIntentHash = computeCheckoutIntentHash');
  const existingUrlLookup = checkout.indexOf('const existingCheckout = await findExistingCheckout');

  assert.ok(preflightCall > -1 && preflightCall < hashCall && hashCall < existingUrlLookup);
  assert.match(checkout, /cacheMs: requireCurrent \? 0 : undefined/);
  assert.match(checkout, /requireCurrentDiamondCatalog: type === 'diamonds'/);
  assert.match(checkout, /CLUB_ITEM_PRICE_CONFIRMATION_REQUIRED/);
  assert.match(checkout, /REQUEST_ID_REQUIRED/);
  assert.match(checkout, /expectedCardChargeCents/);
  assert.match(checkout, /intent\.expected_price !== expectedPrice/);
  assert.match(checkout, /intent\.expected_card_charge_cents !== quote\.cardChargeCents/);
  assert.match(checkout, /CLUB_ITEM_PRICE_CHANGED/);
  assert.match(checkout, /fn_shop_item_availability/);
  assert.match(checkout, /preparedCheckout\.packageCatalogSource !== 'database'/);
  assert.match(checkout, /selected\.length === 1/);
  assert.match(checkout, /CARD_QUOTE_CHANGED/);
  assert.match(checkout, /expected_price: expectedPrice/);
  assert.match(checkout, /package_quote:/);
  assert.match(checkout, /item_name:/);
  assert.match(checkout, /const redemptionIdentity\s*=\s*redemptionIntent\?\.kind === 'club_shop'/);
  assert.match(checkout, /CARD_NOT_REQUIRED/);
  assert.match(checkout, /DIAMOND_WALLET_DEBT/);
  assert.match(
    checkout,
    /!profile[\s\S]*?profile\.diamonds === null[\s\S]*?DIAMOND_WALLET_UNAVAILABLE/
  );
  assert.match(checkout, /type === 'diamonds'[\s\S]*?canCreditDiamondWallet/);
  assert.match(checkout, /DIAMOND_WALLET_CAPACITY_EXCEEDED/);
  assert.match(checkout, /unit_amount: pkg\.priceCents/);
  assert.match(checkout, /preparedCheckout\.checkoutTotals\.cardChargeUsd/);
  const capacityGate = checkout.indexOf('!canCreditDiamondWallet(');
  const customerCreate = checkout.indexOf('stripe.customers.create(');
  const purchaseInsert = checkout.search(/\.from\('diamond_purchases'\)\s*\.insert\(/);
  const stripeCreate = checkout.indexOf('stripe.checkout.sessions.create(');
  assert.ok(
    capacityGate > -1 &&
      capacityGate < customerCreate &&
      capacityGate < purchaseInsert &&
      capacityGate < stripeCreate
  );
});

test('Club Shop catalog and both admin writers share the DB-backed Card price boundary', async () => {
  const [catalogApi, manageApi, legacyAdminApi, migration] = await Promise.all([
    read('pages/api/club-arena/marketplace-items.js'),
    read('pages/api/club-arena/manage-shop.js'),
    read('pages/api/club-arena/shop-items.js'),
    read('supabase/migrations/20260906183000_club_shop_price_authorization.sql'),
  ]);
  assert.match(catalogApi, /fn_shop_item_availability/);
  assert.match(catalogApi, /availability_reason:/);
  assert.match(catalogApi, /card_quote:/);
  assert.match(catalogApi, /cardChargeCents:/);
  assert.match(
    catalogApi,
    /const walletIsValid\s*=\s*Boolean\(profileRow\)[\s\S]*?profileRow\.diamonds !== null[\s\S]*?Number\.isSafeInteger\(walletBalance\)/
  );
  assert.match(
    catalogApi,
    /walletIsValid[\s\S]*?walletBalance >= 0[\s\S]*?getClubCardCheckoutQuoteFromCatalog/
  );
  assert.match(catalogApi, /maximumCardFundedPrice:/);
  for (const source of [manageApi, legacyAdminApi]) {
    assert.match(source, /loadActiveDiamondPackageCatalog/);
    assert.match(source, /getMaximumCardFundedClubItemPrice/);
    assert.match(source, /CARD_PRICE_LIMIT_EXCEEDED/);
    assert.match(source, /DIAMOND_PACKAGE_CATALOG_UNAVAILABLE/);
  }
  assert.match(manageApi, /maximumCardFundedPrice,/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.diamond_packages/);
  assert.match(migration, /price_usd numeric\(10,2\)/);
  assert.match(migration, /diamond_packages_stripe_price_chk/);
  assert.match(migration, /diamond_packages_credit_bounds_chk/);
  assert.match(migration, /ON CONFLICT \(package_key\) DO NOTHING/);
  assert.match(migration, /ALTER TABLE public\.diamond_packages ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.diamond_packages FROM PUBLIC, anon/);
  assert.match(migration, /GRANT ALL PRIVILEGES ON TABLE public\.diamond_packages TO service_role/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.diamond_packages TO authenticated/);
  assert.doesNotMatch(
    migration,
    /REVOKE ALL ON TABLE public\.diamond_packages FROM PUBLIC, anon, authenticated/
  );
});

test('Diamond and merchandise Stripe ambiguity stays pending and recoverable', async () => {
  const checkout = await read('pages/api/store/create-checkout-session.js');
  assert.match(checkout, /type === 'diamonds' && !checkoutRequestId/);
  assert.match(checkout, /type === 'merchandise' && !checkoutRequestId/);

  const catchStart = checkout.indexOf('} catch (sessionError) {');
  const linkStart = checkout.indexOf(
    "if (type === 'subscription' && subscriptionClaim)",
    catchStart
  );
  const failureRecovery = checkout.slice(catchStart, linkStart);
  for (const type of ['diamonds', 'merchandise']) {
    const branchStart = failureRecovery.indexOf(`type === '${type}'`);
    assert.ok(branchStart > -1, `${type} failure recovery must exist`);
    const branch = failureRecovery.slice(branchStart);
    assert.match(branch, /isAmbiguousStripeCreateFailure\(sessionError\)/);
    assert.match(branch, /sessionError\.checkoutRetryable = true/);
  }
  assert.match(failureRecovery, /\.eq\('user_id', user\.id\)/);
  assert.match(failureRecovery, /\.is\('stripe_checkout_session_id', null\)/);

  for (const label of ['diamondSessionLinked', 'merchandiseSessionLinked']) {
    assert.match(checkout, new RegExp(`let ${label}`));
  }
  assert.match(
    checkout,
    /\.eq\('stripe_checkout_session_id', session\.id\)[\s\S]*?\.maybeSingle\(\)/
  );
  assert.match(checkout, /recoveryError\.checkoutRetryable = true/);
});

test('hidden Club Shop items cannot bypass the Card price boundary when reactivated', async () => {
  const [manageApi, legacyAdminApi] = await Promise.all([
    read('pages/api/club-arena/manage-shop.js'),
    read('pages/api/club-arena/shop-items.js'),
  ]);
  const toggleBlocks = [
    manageApi.slice(
      manageApi.indexOf("if (action === 'toggle')"),
      manageApi.indexOf("if (action === 'delete')", manageApi.indexOf("if (action === 'toggle')"))
    ),
    legacyAdminApi.slice(
      legacyAdminApi.indexOf("if (action === 'toggle')"),
      legacyAdminApi.indexOf(
        "if (action === 'update')",
        legacyAdminApi.indexOf("if (action === 'toggle')")
      )
    ),
  ];

  for (const toggle of toggleBlocks) {
    assert.match(toggle, /select\('[^']*is_active[^']*price[^']*'\)/);
    assert.match(toggle, /const nextIsActive = !/);
    assert.match(toggle, /if \(nextIsActive\)[\s\S]*?await loadMaximumCardFundedPrice\(\)/);
    assert.match(toggle, /DIAMOND_PACKAGE_CATALOG_UNAVAILABLE/);
    assert.match(toggle, /storedPrice > maximumCardFundedPrice/);
    assert.match(toggle, /CARD_PRICE_LIMIT_EXCEEDED/);
    assert.match(toggle, /update\(\{ is_active: nextIsActive \}\)/);
  }
});
