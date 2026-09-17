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
  const quantity = value.quantity;
  const unitPriceCents = value.unitPriceCents;
  const baseDiamonds = value.baseDiamonds;
  const bonusDiamonds = value.bonusDiamonds;
  const cardCharge = value.cardCharge;
  const cardChargeCents = value.cardChargeCents;
  const diamondsPurchased = value.diamondsPurchased;
  const diamondPurchaseBalance = value.diamondPurchaseBalance;
  const diamondShortfall = value.diamondShortfall;
  const cardPurchaseBalance = value.cardPurchaseBalance;

  if (
    !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(packageId) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 10 ||
    !Number.isSafeInteger(unitPriceCents) ||
    unitPriceCents <= 0 ||
    !Number.isSafeInteger(baseDiamonds) ||
    baseDiamonds <= 0 ||
    !Number.isSafeInteger(bonusDiamonds) ||
    bonusDiamonds < 0 ||
    !Number.isFinite(cardCharge) ||
    cardCharge <= 0 ||
    !Number.isSafeInteger(cardChargeCents) ||
    cardChargeCents <= 0 ||
    Math.round(cardCharge * 100) !== cardChargeCents ||
    unitPriceCents * quantity !== cardChargeCents ||
    (baseDiamonds + bonusDiamonds) * quantity !== diamondsPurchased ||
    !Number.isSafeInteger(diamondsPurchased) ||
    diamondsPurchased <= 0 ||
    !Number.isSafeInteger(diamondPurchaseBalance) ||
    diamondPurchaseBalance < 0 ||
    !Number.isSafeInteger(diamondShortfall) ||
    diamondShortfall < 0 ||
    !Number.isSafeInteger(cardPurchaseBalance) ||
    cardPurchaseBalance < 0
  ) {
    return null;
  }

  return {
    packageId,
    quantity,
    unitPriceCents,
    baseDiamonds,
    bonusDiamonds,
    cardCharge,
    cardChargeCents,
    diamondsPurchased,
    diamondPurchaseBalance,
    diamondShortfall,
    cardPurchaseBalance,
  };
}

const CLUB_ITEM_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLUB_PURCHASE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,180}$/;
const VERIFIED_CLUB_ROLES = new Set([
  'owner',
  'co_owner',
  'admin',
  'super_agent',
  'agent',
  'sub_agent',
  'player',
]);
const VERIFIED_CLUB_GRANTS = Object.freeze({
  'Time Banks': 'time_bank',
  Throwables: 'throwable',
});
const ALL_THROWABLES_NAME = 'All Throwables Pack (10)';

/**
 * Validate one shopper-facing item returned by Marketplace Items. This is a
 * serialization boundary, not a best-effort mapper: missing price,
 * availability, fulfillment, or Card quote fields must never become an
 * enabled purchase in an older browser bundle.
 */
export function normalizeVerifiedClubShopItem(raw, walletBalance) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const expectedGrant = VERIFIED_CLUB_GRANTS[String(raw.category || '')];
  const grantQty = raw.grant_spec?.qty;
  const listPrice = raw.price;
  const effectivePrice = raw.effective_price;
  const verifiedListPrice = raw.list_price;
  if (
    !CLUB_ITEM_UUID.test(String(raw.id || '')) ||
    typeof raw.name !== 'string' ||
    !raw.name.trim() ||
    !expectedGrant ||
    raw.item_type !== expectedGrant ||
    raw.grant_spec?.type !== expectedGrant ||
    raw.stackable !== true ||
    !Number.isSafeInteger(grantQty) ||
    grantQty <= 0 ||
    grantQty > 1000 ||
    !Number.isSafeInteger(listPrice) ||
    listPrice < 0 ||
    !Number.isSafeInteger(effectivePrice) ||
    effectivePrice < 0 ||
    !Number.isSafeInteger(verifiedListPrice) ||
    verifiedListPrice < effectivePrice ||
    typeof raw.available !== 'boolean' ||
    typeof raw.card_checkout_available !== 'boolean' ||
    typeof raw.on_sale !== 'boolean' ||
    !Number.isSafeInteger(raw.purchase_count) ||
    raw.purchase_count < 0 ||
    !Number.isSafeInteger(raw.my_purchase_count) ||
    raw.my_purchase_count < 0
  ) {
    return null;
  }
  if (!Number.isSafeInteger(walletBalance) || walletBalance < 0) return null;
  if (listPrice !== verifiedListPrice || raw.on_sale !== effectivePrice < verifiedListPrice) {
    return null;
  }
  if (expectedGrant === 'throwable' && (raw.name !== ALL_THROWABLES_NAME || grantQty !== 10))
    return null;
  if (expectedGrant !== 'throwable' && raw.name === ALL_THROWABLES_NAME) return null;
  if (
    raw.available === false &&
    (typeof raw.availability_reason !== 'string' || !raw.availability_reason.trim())
  ) {
    return null;
  }

  const cardQuote = normalizeClubCardQuote(raw.card_quote);
  if (raw.card_checkout_available === true && !cardQuote) return null;
  if (
    cardQuote &&
    (cardQuote.diamondShortfall !== Math.max(0, effectivePrice - walletBalance) ||
      cardQuote.diamondPurchaseBalance !== Math.max(0, walletBalance - effectivePrice) ||
      cardQuote.cardPurchaseBalance !==
        walletBalance + cardQuote.diamondsPurchased - effectivePrice ||
      cardQuote.diamondsPurchased < cardQuote.diamondShortfall)
  )
    return null;
  if (
    raw.card_checkout_available === false &&
    (raw.card_quote !== null ||
      typeof raw.card_checkout_reason !== 'string' ||
      !raw.card_checkout_reason.trim())
  )
    return null;
  return {
    ...raw,
    price: listPrice,
    effective_price: effectivePrice,
    list_price: verifiedListPrice,
    card_quote: cardQuote,
  };
}

export function normalizeVerifiedClubShopItems(raw, walletBalance) {
  if (!Array.isArray(raw)) return null;
  const items = raw.map((item) => normalizeVerifiedClubShopItem(item, walletBalance));
  return items.every(Boolean) ? items : null;
}

export function normalizeVerifiedClubShopPurchases(raw) {
  if (!Array.isArray(raw)) return null;
  const purchases = raw.map((purchase) => {
    if (!purchase || typeof purchase !== 'object' || Array.isArray(purchase)) return null;
    const createdAt =
      typeof purchase.created_at === 'string' && Number.isFinite(Date.parse(purchase.created_at))
        ? purchase.created_at
        : null;
    const refundedAt =
      purchase.refunded_at === null
        ? null
        : typeof purchase.refunded_at === 'string' &&
            Number.isFinite(Date.parse(purchase.refunded_at))
          ? purchase.refunded_at
          : undefined;
    const itemNameType = purchase.item_name === null ? null : typeof purchase.item_name;
    const itemCategoryType = purchase.item_category === null ? null : typeof purchase.item_category;
    if (
      !CLUB_ITEM_UUID.test(String(purchase.id || '')) ||
      !CLUB_ITEM_UUID.test(String(purchase.item_id || '')) ||
      !Number.isSafeInteger(purchase.price_paid) ||
      purchase.price_paid < 0 ||
      !['diamonds', 'chips'].includes(purchase.currency) ||
      !createdAt ||
      refundedAt === undefined ||
      ![null, 'string'].includes(itemNameType) ||
      ![null, 'string'].includes(itemCategoryType)
    )
      return null;
    return { ...purchase, created_at: createdAt, refunded_at: refundedAt };
  });
  return purchases.every(Boolean) ? purchases : null;
}

export function normalizeVerifiedClubShopContext(clubId, role) {
  if (clubId === null && role === null) return { clubId: null, role: 'player' };
  if (!CLUB_ITEM_UUID.test(String(clubId || '')) || !VERIFIED_CLUB_ROLES.has(role)) return null;
  return { clubId, role };
}

/** Bind a private Club Shop catalog response to the account that requested it. */
export function normalizeVerifiedClubShopAccountId(accountId, expectedAccountId) {
  const returned = typeof accountId === 'string' ? accountId.trim() : '';
  const expected = typeof expectedAccountId === 'string' ? expectedAccountId.trim() : '';
  return returned && returned === accountId && returned === expected ? returned : null;
}

/**
 * Normalize the exact JSON shapes returned by the installed Club Shop RPC.
 * A fresh commit omits `duplicate`; a durable replay sets it to true and omits
 * display copy. The API may use the already verified current item copy only
 * for that exact replay, while purchase id, paid price, and balance must still
 * come from the financial receipt.
 */
export function normalizeClubPurchaseRpcSuccess(raw, expected) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    !expected ||
    typeof expected !== 'object' ||
    Array.isArray(expected)
  )
    return null;
  const expectedPrice = expected.price;
  const expectedName = typeof expected.name === 'string' ? expected.name : '';
  const expectedItemType = typeof expected.itemType === 'string' ? expected.itemType : '';
  const duplicate = raw.duplicate === true;
  const duplicateMarkerValid = raw.duplicate === undefined || typeof raw.duplicate === 'boolean';
  const itemName = duplicate && raw.item_name === undefined ? expectedName : raw.item_name;
  const itemType = duplicate && raw.item_type === undefined ? expectedItemType : raw.item_type;
  if (
    raw.success !== true ||
    !CLUB_ITEM_UUID.test(String(raw.purchase_id || '')) ||
    !Number.isSafeInteger(raw.new_balance) ||
    raw.new_balance < 0 ||
    !Number.isSafeInteger(expectedPrice) ||
    expectedPrice < 0 ||
    !Number.isSafeInteger(raw.price_paid) ||
    raw.price_paid !== expectedPrice ||
    !duplicateMarkerValid ||
    !expectedName ||
    !expectedItemType ||
    itemName !== expectedName ||
    itemType !== expectedItemType
  )
    return null;
  return Object.freeze({
    purchaseId: raw.purchase_id,
    newBalance: raw.new_balance,
    pricePaid: raw.price_paid,
    duplicate,
    itemName,
    itemType,
  });
}

/**
 * A 2xx body is not proof of settlement by itself. Bind the response to the
 * exact club, item, price, and fulfillable item identity that the buyer
 * confirmed before retiring the durable request key.
 */
export function normalizeVerifiedClubPurchaseSuccess(raw, expected) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    !expected ||
    typeof expected !== 'object' ||
    Array.isArray(expected)
  )
    return null;
  const expectedClubId = String(expected.clubId || '');
  const expectedItemId = String(expected.itemId || '');
  const expectedAccountId = String(expected.accountId || '');
  const expectedRequestId = String(expected.requestId || '');
  const expectedName = String(expected.name || '');
  const expectedItemType = String(expected.itemType || '');
  const expectedPrice = expected.price;
  if (
    raw.success !== true ||
    !CLUB_ITEM_UUID.test(expectedClubId) ||
    !CLUB_ITEM_UUID.test(expectedItemId) ||
    !CLUB_ITEM_UUID.test(expectedAccountId) ||
    !CLUB_PURCHASE_REQUEST_ID.test(expectedRequestId) ||
    raw.accountId !== expectedAccountId ||
    raw.requestId !== expectedRequestId ||
    raw.clubId !== expectedClubId ||
    raw.itemId !== expectedItemId ||
    !CLUB_ITEM_UUID.test(String(raw.purchaseId || '')) ||
    raw.currency !== 'diamonds' ||
    !Number.isSafeInteger(expectedPrice) ||
    expectedPrice < 0 ||
    raw.pricePaid !== expectedPrice ||
    !Number.isSafeInteger(raw.newBalance) ||
    raw.newBalance < 0 ||
    typeof raw.duplicate !== 'boolean' ||
    !raw.item ||
    typeof raw.item !== 'object' ||
    Array.isArray(raw.item) ||
    raw.item.name !== expectedName ||
    raw.item.type !== expectedItemType
  )
    return null;
  return {
    purchaseId: raw.purchaseId,
    accountId: raw.accountId,
    requestId: raw.requestId,
    clubId: raw.clubId,
    itemId: raw.itemId,
    currency: raw.currency,
    pricePaid: raw.pricePaid,
    newBalance: raw.newBalance,
    duplicate: raw.duplicate,
    item: { name: raw.item.name, type: raw.item.type },
  };
}

const INVENTORY_REFRESH_REASONS = new Set([
  'already_owned',
  'fulfillment_unavailable',
  'inactive',
  'limit_reached',
  'no_longer_available',
  'not_found',
  'not_yet_available',
  'price_changed',
  'price_confirmation_required',
  'sold_out',
]);

/**
 * Decide whether a rejected Club Shop purchase is proven not to have charged.
 * Timeouts, transport errors, generic conflicts, throttling, and every 5xx stay
 * ambiguous so the browser must retain and replay the same durable request id.
 */
export function classifyClubPurchaseRefusal(status, body = null, expected = null) {
  const reason = typeof body?.reason === 'string' ? body.reason : '';
  const expectedAccountId = String(expected?.accountId || '');
  const expectedRequestId = String(expected?.requestId || '');
  const exactBinding =
    body?.success === false &&
    CLUB_ITEM_UUID.test(expectedAccountId) &&
    CLUB_PURCHASE_REQUEST_ID.test(expectedRequestId) &&
    body?.accountId === expectedAccountId &&
    body?.requestId === expectedRequestId;
  // The installed RPC checks its durable reference before waiting on the
  // user/item lock. A concurrent same-key call can therefore return a business
  // refusal after its sibling committed. No HTTP refusal alone proves that the
  // durable key is safe to rotate; retain it and replay until an exact success
  // receipt arrives.
  return Object.freeze({
    definitive: false,
    refreshInventory: exactBinding && INVENTORY_REFRESH_REASONS.has(reason),
    exactBinding,
    reason,
  });
}
