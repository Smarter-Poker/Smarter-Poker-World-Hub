function finiteNonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function getClubItemEffectivePrice(listPrice, salePrice = null) {
  const regular = finiteNonNegative(listPrice);
  if (salePrice == null || salePrice === '') return regular;

  const sale = Number(salePrice);
  return Number.isFinite(sale) && sale >= 0 && sale <= regular ? sale : regular;
}

export function getClubDiamondPurchaseProjection(priceInDiamonds, currentBalance = 0) {
  const itemPrice = Number(priceInDiamonds);
  const parsedBalance = Number(currentBalance);
  if (!Number.isFinite(itemPrice) || itemPrice < 0) return null;

  const walletBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
  return {
    itemPrice,
    walletBalance,
    hasDebt: walletBalance < 0,
    shortfall: itemPrice === 0 ? 0 : Math.max(0, itemPrice - walletBalance),
    remainingBalance: itemPrice === 0 ? walletBalance : Math.max(0, walletBalance - itemPrice),
  };
}

/**
 * Validate a server-owned Club Shop Card quote before rendering or submitting
 * it. Package prices intentionally do not live in the browser bundle: the
 * active database catalog is the only source allowed to authorize a charge.
 */
export function normalizeClubCardQuote(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const packageId = String(value.packageId || '');
  const quantity = Number(value.quantity);
  const cardCharge = Number(value.cardCharge);
  const cardChargeCents = Number(value.cardChargeCents);
  const diamondsPurchased = Number(value.diamondsPurchased);
  const diamondPurchaseBalance = Number(value.diamondPurchaseBalance);
  const diamondShortfall = Number(value.diamondShortfall);
  const cardPurchaseBalance = Number(value.cardPurchaseBalance);

  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(packageId)
    || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10
    || !Number.isFinite(cardCharge) || cardCharge <= 0
    || !Number.isSafeInteger(cardChargeCents) || cardChargeCents <= 0
    || Math.round(cardCharge * 100) !== cardChargeCents
    || !Number.isSafeInteger(diamondsPurchased) || diamondsPurchased <= 0
    || !Number.isSafeInteger(diamondPurchaseBalance) || diamondPurchaseBalance < 0
    || !Number.isSafeInteger(diamondShortfall) || diamondShortfall < 0
    || !Number.isSafeInteger(cardPurchaseBalance) || cardPurchaseBalance < 0) {
    return null;
  }

  return {
    packageId,
    quantity,
    cardCharge,
    cardChargeCents,
    diamondsPurchased,
    diamondPurchaseBalance,
    diamondShortfall,
    cardPurchaseBalance,
  };
}
