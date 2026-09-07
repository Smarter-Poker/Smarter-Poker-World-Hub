export const MAX_DIAMOND_QUANTITY_PER_PACKAGE = 10;
export const POSTGRES_INT4_MAX = 2_147_483_647;
export const STRIPE_MIN_USD_UNIT_AMOUNT_CENTS = 50;
export const STRIPE_MAX_USD_UNIT_AMOUNT_CENTS = 99_999_999;

// Emergency continuity catalog for ordinary Diamond purchases. Club Shop
// Card redemptions never use this fallback: a stale package price could take
// a Card payment that cannot fund the item selected by the member.
export const BUILT_IN_DIAMOND_PACKAGES = Object.freeze({
  micro: Object.freeze({ diamonds: 100, price: 1, priceCents: 100, bonus: 0, name: 'Micro' }),
  small: Object.freeze({ diamonds: 500, price: 5, priceCents: 500, bonus: 0, name: 'Small' }),
  medium: Object.freeze({ diamonds: 1000, price: 10, priceCents: 1000, bonus: 0, name: 'Medium' }),
  standard: Object.freeze({ diamonds: 2500, price: 25, priceCents: 2500, bonus: 0, name: 'Standard' }),
  large: Object.freeze({ diamonds: 5000, price: 50, priceCents: 5000, bonus: 0, name: 'Large' }),
  value: Object.freeze({ diamonds: 10000, price: 100, priceCents: 10000, bonus: 500, name: 'Value' }),
  premium: Object.freeze({ diamonds: 25000, price: 250, priceCents: 25000, bonus: 1250, name: 'Premium' }),
  whale: Object.freeze({ diamonds: 50000, price: 500, priceCents: 50000, bonus: 2500, name: 'Whale' }),
});

const PACKAGE_CACHE_MS = 60_000;
let packageCache = { at: 0, catalog: null };

/** Parse a database USD amount without ever rounding a fractional cent. */
export function parseUsdAmountToCents(value) {
  const raw = String(value ?? '').trim();
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);
  if (!match) return null;

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || '').padEnd(2, '0'));
  const centsBigInt = whole * 100n + fraction;
  if (centsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  const cents = Number(centsBigInt);
  return cents >= STRIPE_MIN_USD_UNIT_AMOUNT_CENTS
    && cents <= STRIPE_MAX_USD_UNIT_AMOUNT_CENTS
    ? cents
    : null;
}

export function normalizeDiamondPackageRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('diamond_packages returned no active rows');
  }

  const catalog = Object.create(null);
  for (const row of rows) {
    const key = String(row?.package_key || '').trim();
    const diamonds = Number(row?.diamonds);
    const bonus = Number(row?.bonus_diamonds ?? 0);
    const priceCents = parseUsdAmountToCents(row?.price_usd);
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(key)
      || Object.prototype.hasOwnProperty.call(catalog, key)
      || !Number.isSafeInteger(diamonds) || diamonds <= 0
      || !Number.isSafeInteger(bonus) || bonus < 0
      || !Number.isSafeInteger(diamonds + bonus)
      || diamonds + bonus > POSTGRES_INT4_MAX
      || priceCents === null) {
      throw new Error(`diamond_packages row "${key || 'unnamed'}" is not usable`);
    }
    catalog[key] = Object.freeze({
      diamonds,
      price: priceCents / 100,
      priceCents,
      bonus,
      name: String(row?.display_name || key).slice(0, 200),
    });
  }
  return Object.freeze(catalog);
}

/**
 * Read the active server-owned package catalog. Only successful database
 * reads enter the cache, so a strict Club Shop quote can never inherit an
 * emergency fallback used by a different request.
 */
export async function loadActiveDiamondPackageCatalog(
  supabase,
  { allowFallback = false, cacheMs = PACKAGE_CACHE_MS } = {}
) {
  const now = Date.now();
  if (packageCache.catalog && now - packageCache.at < cacheMs) {
    return { catalog: packageCache.catalog, source: 'database', error: null };
  }

  try {
    const { data, error } = await supabase
      .from('diamond_packages')
      .select('package_key, display_name, diamonds, bonus_diamonds, price_usd, active')
      .eq('active', true);
    if (error) throw error;
    const catalog = normalizeDiamondPackageRows(data);
    packageCache = { at: now, catalog };
    return { catalog, source: 'database', error: null };
  } catch (error) {
    if (!allowFallback) throw error;
    return { catalog: BUILT_IN_DIAMOND_PACKAGES, source: 'fallback', error };
  }
}

/** Resolve only server-owned values from an already validated catalog. */
export function resolveDiamondPackage(item, catalog = BUILT_IN_DIAMOND_PACKAGES) {
  const raw = item?.packageId ?? item?.id;
  if (typeof raw !== 'string' || !raw) return null;
  const has = (key) => Object.prototype.hasOwnProperty.call(catalog, key);
  const key = has(raw) ? raw : raw.replace(/^diamond-/, '');
  return has(key) ? { key, ...catalog[key] } : null;
}

/**
 * Aggregate a validated Diamond cart with integer arithmetic. The pending
 * purchase row and Stripe line items must describe the exact same cents.
 */
export function getDiamondCheckoutTotals(resolvedPackages) {
  if (!Array.isArray(resolvedPackages) || resolvedPackages.length === 0) return null;

  let baseTotal = 0n;
  let bonusTotal = 0n;
  let cardTotalCents = 0n;
  for (const pkg of resolvedPackages) {
    const quantity = Number(pkg?.quantity);
    const diamonds = Number(pkg?.diamonds);
    const bonus = Number(pkg?.bonus ?? 0);
    const priceCents = Number(pkg?.priceCents);
    if (!Number.isSafeInteger(quantity)
      || quantity < 1 || quantity > MAX_DIAMOND_QUANTITY_PER_PACKAGE
      || !Number.isSafeInteger(diamonds) || diamonds <= 0
      || !Number.isSafeInteger(bonus) || bonus < 0
      || !Number.isSafeInteger(priceCents)
      || priceCents < STRIPE_MIN_USD_UNIT_AMOUNT_CENTS
      || priceCents > STRIPE_MAX_USD_UNIT_AMOUNT_CENTS) {
      return null;
    }
    baseTotal += BigInt(diamonds) * BigInt(quantity);
    bonusTotal += BigInt(bonus) * BigInt(quantity);
    cardTotalCents += BigInt(priceCents) * BigInt(quantity);
  }

  const creditTotal = baseTotal + bonusTotal;
  if (baseTotal > BigInt(POSTGRES_INT4_MAX)
    || bonusTotal > BigInt(POSTGRES_INT4_MAX)
    || creditTotal > BigInt(POSTGRES_INT4_MAX)
    || cardTotalCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  return Object.freeze({
    diamonds: Number(baseTotal),
    bonus: Number(bonusTotal),
    credit: Number(creditTotal),
    cardChargeCents: Number(cardTotalCents),
    cardChargeUsd: Number(cardTotalCents) / 100,
  });
}

export function canCreditDiamondWallet(walletBalanceValue, creditValue) {
  if (walletBalanceValue === null || walletBalanceValue === ''
    || walletBalanceValue === undefined) return false;
  const walletBalance = Number(walletBalanceValue);
  const credit = Number(creditValue);
  return Number.isSafeInteger(walletBalance)
    && walletBalance >= -2_147_483_648
    && walletBalance <= POSTGRES_INT4_MAX
    && Number.isSafeInteger(credit)
    && credit > 0
    && credit <= POSTGRES_INT4_MAX - walletBalance;
}

export function getMaximumCardFundedClubItemPrice(
  catalog,
  maxQuantity = MAX_DIAMOND_QUANTITY_PER_PACKAGE
) {
  if (!catalog || typeof catalog !== 'object') return 0;
  return Object.values(catalog).reduce((maximum, pkg) => {
    const diamonds = Number(pkg?.diamonds);
    const bonus = Number(pkg?.bonus ?? 0);
    const perPackage = diamonds + bonus;
    const supported = perPackage * maxQuantity;
    return Number.isSafeInteger(perPackage) && perPackage > 0
      && Number.isSafeInteger(supported) && supported > 0
      ? Math.max(maximum, supported)
      : maximum;
  }, 0);
}

/**
 * Select the least expensive current package/quantity that independently
 * funds one Club Shop item. Card checkout intentionally preserves the
 * member's existing nonnegative Diamond balance; it is not a hybrid tender.
 */
export function getClubCardCheckoutQuoteFromCatalog(
  itemPriceValue,
  currentBalanceValue,
  catalog,
  maxQuantity = MAX_DIAMOND_QUANTITY_PER_PACKAGE
) {
  const itemPrice = Number(itemPriceValue);
  const walletBalance = Number(currentBalanceValue);
  if (!Number.isSafeInteger(itemPrice) || itemPrice <= 0
    || !Number.isSafeInteger(walletBalance) || walletBalance < 0
    || !catalog || typeof catalog !== 'object') {
    return null;
  }

  const candidates = [];
  for (const [packageId, pkg] of Object.entries(catalog)) {
    const baseDiamonds = Number(pkg?.diamonds);
    const bonusDiamonds = Number(pkg?.bonus ?? 0);
    const unitPriceCents = Number.isSafeInteger(pkg?.priceCents)
      ? pkg.priceCents
      : parseUsdAmountToCents(pkg?.price);
    const diamondsPerPackage = baseDiamonds + bonusDiamonds;
    if (!Number.isSafeInteger(baseDiamonds) || baseDiamonds <= 0
      || !Number.isSafeInteger(bonusDiamonds) || bonusDiamonds < 0
      || !Number.isSafeInteger(diamondsPerPackage) || diamondsPerPackage <= 0
      || !Number.isSafeInteger(unitPriceCents) || unitPriceCents <= 0) {
      continue;
    }
    const quantity = Math.ceil(itemPrice / diamondsPerPackage);
    if (quantity < 1 || quantity > maxQuantity) continue;
    const diamondsPurchased = diamondsPerPackage * quantity;
    const cardChargeCents = unitPriceCents * quantity;
    if (!Number.isSafeInteger(diamondsPurchased)
      || !Number.isSafeInteger(cardChargeCents)
      // profiles.diamonds is an int4. Reject the quote before Stripe if the
      // paid package credit could overflow that authoritative wallet column.
      || diamondsPurchased > POSTGRES_INT4_MAX - walletBalance) continue;
    candidates.push({
      packageId,
      quantity,
      baseDiamonds,
      bonusDiamonds,
      diamonds: diamondsPerPackage,
      unitPriceCents,
      cardChargeCents,
      diamondsPurchased,
    });
  }

  candidates.sort((a, b) => (
    a.cardChargeCents - b.cardChargeCents
    || a.diamondsPurchased - b.diamondsPurchased
    || a.quantity - b.quantity
    || a.packageId.localeCompare(b.packageId)
  ));
  const selected = candidates[0];
  if (!selected) return null;

  return {
    packageId: selected.packageId,
    quantity: selected.quantity,
    diamonds: selected.diamonds,
    baseDiamonds: selected.baseDiamonds,
    bonusDiamonds: selected.bonusDiamonds,
    price: selected.unitPriceCents / 100,
    cardChargeCents: selected.cardChargeCents,
    cardCharge: selected.cardChargeCents / 100,
    diamondsPurchased: selected.diamondsPurchased,
    itemPrice,
    walletBalance,
    diamondPurchaseBalance: Math.max(0, walletBalance - itemPrice),
    diamondShortfall: Math.max(0, itemPrice - walletBalance),
    cardPurchaseBalance: walletBalance + selected.diamondsPurchased - itemPrice,
  };
}
