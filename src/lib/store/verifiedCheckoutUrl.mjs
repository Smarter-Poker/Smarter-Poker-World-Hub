const MAX_CHECKOUT_URL_LENGTH = 4096;
const VERIFIED_CHECKOUT_HOSTS = new Set(['checkout.stripe.com']);
const STRIPE_CHECKOUT_SESSION_ID_RE = /^cs_(?:test|live)_[A-Za-z0-9]{6,255}$/;
const CHECKOUT_REQUEST_ID_RE = /^[a-z0-9][a-z0-9_-]{11,127}$/i;
const CHECKOUT_REQUEST_REPLACEMENT_CODES = new Set(['CHECKOUT_EXPIRED']);
const CHECKOUT_STATUS_TYPES = new Set(['diamonds', 'merchandise', 'subscription', 'vip_lifetime']);
const CHECKOUT_PAYMENT_STATUSES = new Set(['paid', 'unpaid', 'no_payment_required']);
const CHECKOUT_SESSION_STATUSES = new Set(['open', 'complete', 'expired']);
const CHECKOUT_RECORD_STATUSES = new Set(['pending', 'complete', 'failed']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSTGRES_INT4_MIN = -2_147_483_648;
const POSTGRES_INT4_MAX = 2_147_483_647;

export function exactJsonValueMatches(actual, expected) {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((entry, index) => exactJsonValueMatches(entry, expected[index]))
    );
  }
  const actualIsObject = actual !== null && typeof actual === 'object';
  const expectedIsObject = expected !== null && typeof expected === 'object';
  if (actualIsObject || expectedIsObject) {
    if (!actualIsObject || !expectedIsObject) return false;
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    return (
      actualKeys.length === expectedKeys.length &&
      actualKeys.every((key, index) => key === expectedKeys[index]) &&
      actualKeys.every((key) => exactJsonValueMatches(actual[key], expected[key]))
    );
  }
  return Object.is(actual, expected);
}

function exactPositiveDiamondAmount(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 100000 ? amount : null;
}

function exactUsdCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && Math.abs(amount * 100 - cents) < 1e-8 ? cents : null;
}

function verifiedAccountId(value) {
  const accountId = typeof value === 'string' ? value.trim() : '';
  return accountId && accountId.length <= 160 ? accountId : null;
}

/** Build the exact account-bound Diamond terms that the checkout API echoes. */
export function diamondCheckoutOfferConfirmation(accountIdValue, rawLines) {
  const accountId = verifiedAccountId(accountIdValue);
  if (!accountId || !Array.isArray(rawLines) || rawLines.length === 0) return null;

  const byPackage = new Map();
  for (const raw of rawLines) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const packageId = String(raw.packageId || raw.id || '').replace(/^diamond-/, '');
    const quantity = Number(raw.quantity ?? 1);
    const unitCents = Number.isSafeInteger(raw.unitCents)
      ? raw.unitCents
      : Number.isSafeInteger(raw.priceCents)
        ? raw.priceCents
        : exactUsdCents(raw.price);
    const diamonds = Number(raw.baseDiamonds ?? raw.diamonds);
    const bonus = Number(raw.bonusDiamonds ?? raw.bonus ?? 0);
    if (
      !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(packageId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 10 ||
      !Number.isSafeInteger(unitCents) ||
      unitCents < 1 ||
      !Number.isSafeInteger(diamonds) ||
      diamonds < 1 ||
      !Number.isSafeInteger(bonus) ||
      bonus < 0
    )
      return null;
    if (raw.price !== undefined && exactUsdCents(raw.price) !== unitCents) return null;

    const previous = byPackage.get(packageId);
    if (previous) {
      if (
        previous.unitCents !== unitCents ||
        previous.diamonds !== diamonds ||
        previous.bonus !== bonus ||
        previous.quantity + quantity > 10
      )
        return null;
      previous.quantity += quantity;
    } else {
      byPackage.set(packageId, { packageId, quantity, unitCents, diamonds, bonus });
    }
  }

  const items = [...byPackage.values()].sort((left, right) =>
    left.packageId.localeCompare(right.packageId)
  );
  let totalCents = 0n;
  let totalDiamonds = 0n;
  let totalBonus = 0n;
  for (const item of items) {
    totalCents += BigInt(item.unitCents) * BigInt(item.quantity);
    totalDiamonds += BigInt(item.diamonds) * BigInt(item.quantity);
    totalBonus += BigInt(item.bonus) * BigInt(item.quantity);
  }
  if (
    [totalCents, totalDiamonds, totalBonus].some((value) => value > BigInt(Number.MAX_SAFE_INTEGER))
  )
    return null;
  return Object.freeze({
    version: 1,
    accountId,
    type: 'diamonds',
    currency: 'usd',
    totalCents: Number(totalCents),
    totalDiamonds: Number(totalDiamonds),
    totalBonus: Number(totalBonus),
    items: Object.freeze(items.map((item) => Object.freeze({ ...item }))),
  });
}

/** Bind a Card-funded Club item to both its Diamond package and exact delivery terms. */
export function clubCardCheckoutOfferConfirmation(accountIdValue, rawLines, rawRedemption) {
  const baseOffer = diamondCheckoutOfferConfirmation(accountIdValue, rawLines);
  if (
    !baseOffer ||
    !rawRedemption ||
    typeof rawRedemption !== 'object' ||
    Array.isArray(rawRedemption)
  )
    return null;
  const clubId = String(rawRedemption.clubId || '').trim();
  const itemId = String(rawRedemption.itemId || '').trim();
  const itemPriceDiamonds = Number(rawRedemption.itemPriceDiamonds);
  const cardChargeCents = Number(rawRedemption.cardChargeCents);
  if (
    !UUID_RE.test(clubId) ||
    !UUID_RE.test(itemId) ||
    !Number.isSafeInteger(itemPriceDiamonds) ||
    itemPriceDiamonds < 0 ||
    !Number.isSafeInteger(cardChargeCents) ||
    cardChargeCents < 1 ||
    cardChargeCents !== baseOffer.totalCents
  )
    return null;
  return Object.freeze({
    ...baseOffer,
    redemption: Object.freeze({
      kind: 'club_shop',
      clubId,
      itemId,
      itemPriceDiamonds,
      cardChargeCents,
    }),
  });
}

/** Build the exact account-bound recurring VIP terms that the API echoes. */
export function subscriptionCheckoutOfferConfirmation(accountIdValue, rawPlan) {
  const accountId = verifiedAccountId(accountIdValue);
  if (!accountId || !rawPlan || typeof rawPlan !== 'object' || Array.isArray(rawPlan)) return null;
  const plan = String(rawPlan.plan || rawPlan.id || '')
    .replace(/^vip-/, '')
    .toLowerCase();
  const interval = plan === 'monthly' ? 'month' : plan === 'yearly' ? 'year' : null;
  const suppliedInterval = String(rawPlan.interval || interval || '').toLowerCase();
  const unitCents = Number.isSafeInteger(rawPlan.unitCents)
    ? rawPlan.unitCents
    : Number.isSafeInteger(rawPlan.priceCents)
      ? rawPlan.priceCents
      : exactUsdCents(rawPlan.price);
  if (
    !interval ||
    suppliedInterval !== interval ||
    !Number.isSafeInteger(unitCents) ||
    unitCents < 1 ||
    (rawPlan.price !== undefined && exactUsdCents(rawPlan.price) !== unitCents)
  )
    return null;
  return Object.freeze({
    version: 1,
    accountId,
    type: 'subscription',
    currency: 'usd',
    plan,
    interval,
    quantity: 1,
    unitCents,
    totalCents: unitCents,
  });
}

/** Build the exact account-bound one-time Lifetime VIP terms. */
export function lifetimeCheckoutOfferConfirmation(accountIdValue, rawPlan) {
  const accountId = verifiedAccountId(accountIdValue);
  if (!accountId || !rawPlan || typeof rawPlan !== 'object' || Array.isArray(rawPlan)) return null;
  const plan = String(rawPlan.plan || rawPlan.id || '')
    .replace(/^vip-/, '')
    .toLowerCase();
  const unitCents = Number.isSafeInteger(rawPlan.unitCents)
    ? rawPlan.unitCents
    : Number.isSafeInteger(rawPlan.priceCents)
      ? rawPlan.priceCents
      : exactUsdCents(rawPlan.priceUsd ?? rawPlan.price);
  if (
    plan !== 'lifetime' ||
    !Number.isSafeInteger(unitCents) ||
    unitCents < 1 ||
    (rawPlan.priceUsd !== undefined && exactUsdCents(rawPlan.priceUsd) !== unitCents) ||
    (rawPlan.price !== undefined && exactUsdCents(rawPlan.price) !== unitCents)
  )
    return null;
  return Object.freeze({
    version: 1,
    accountId,
    type: 'vip_lifetime',
    currency: 'usd',
    plan: 'lifetime',
    quantity: 1,
    unitCents,
    totalCents: unitCents,
  });
}

/** Build exact account-bound merchandise lines in integer cents. */
export function merchandiseCheckoutOfferConfirmation(accountIdValue, rawLines) {
  const accountId = verifiedAccountId(accountIdValue);
  if (!accountId || !Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > 50) {
    return null;
  }
  const items = [];
  const identities = new Set();
  for (const raw of rawLines) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = String(raw.catalogId || raw.id || '').trim();
    const rawVariant = raw.variantId ?? raw.variant_id ?? null;
    const variantId = rawVariant == null ? null : String(rawVariant).trim();
    const quantity = Number(raw.quantity ?? 1);
    const unitCents = Number.isSafeInteger(raw.unitCents)
      ? raw.unitCents
      : Number.isSafeInteger(raw.priceCents)
        ? raw.priceCents
        : exactUsdCents(raw.priceUsd ?? raw.price);
    if (
      !id ||
      id.length > 160 ||
      (rawVariant != null && (!variantId || variantId.length > 160)) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10 ||
      !Number.isSafeInteger(unitCents) ||
      unitCents < 1 ||
      (raw.priceUsd !== undefined && exactUsdCents(raw.priceUsd) !== unitCents) ||
      (raw.price !== undefined && exactUsdCents(raw.price) !== unitCents)
    )
      return null;
    const identity = `${id}\u0000${variantId || ''}`;
    if (identities.has(identity)) return null;
    identities.add(identity);
    items.push({ id, variantId, quantity, unitCents });
  }
  items.sort((left, right) =>
    `${left.id}\u0000${left.variantId || ''}`.localeCompare(
      `${right.id}\u0000${right.variantId || ''}`
    )
  );
  let totalCents = 0n;
  for (const item of items) {
    totalCents += BigInt(item.unitCents) * BigInt(item.quantity);
  }
  if (totalCents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Object.freeze({
    version: 1,
    accountId,
    type: 'merchandise',
    currency: 'usd',
    totalCents: Number(totalCents),
    items: Object.freeze(items.map((item) => Object.freeze({ ...item }))),
  });
}

/**
 * Build the exact account-bound terms reviewed before a Diamond-funded
 * merchandise debit. Unlike Card checkout, these prices are integer Diamonds
 * and are compared again while the catalog rows are locked by the settlement
 * transaction.
 */
export function merchandiseDiamondOfferConfirmation(accountIdValue, rawLines) {
  const accountId = verifiedAccountId(accountIdValue);
  if (!accountId || !Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > 50) {
    return null;
  }
  const items = [];
  const identities = new Set();
  for (const raw of rawLines) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = String(raw.catalogId || raw.id || '').trim();
    const rawVariant = raw.variantId ?? raw.variant_id ?? null;
    const variantId = rawVariant == null ? null : String(rawVariant).trim();
    const quantity = Number(raw.quantity ?? raw.qty ?? 1);
    const unitDiamonds = exactPositiveDiamondAmount(
      raw.unitDiamonds ?? raw.priceDiamonds ?? raw.price_diamonds ?? raw.diamonds
    );
    if (
      !id ||
      id.length > 160 ||
      (rawVariant != null && (!variantId || variantId.length > 160)) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10 ||
      unitDiamonds === null
    )
      return null;
    const identity = `${id}\u0000${variantId || ''}`;
    if (identities.has(identity)) return null;
    identities.add(identity);
    items.push({ id, variantId, quantity, unitDiamonds });
  }
  items.sort((left, right) =>
    `${left.id}\u0000${left.variantId || ''}`.localeCompare(
      `${right.id}\u0000${right.variantId || ''}`
    )
  );
  let totalDiamonds = 0n;
  for (const item of items) {
    totalDiamonds += BigInt(item.unitDiamonds) * BigInt(item.quantity);
  }
  if (totalDiamonds > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Object.freeze({
    version: 1,
    accountId,
    type: 'merchandise_diamonds',
    currency: 'diamonds',
    totalDiamonds: Number(totalDiamonds),
    items: Object.freeze(items.map((item) => Object.freeze({ ...item }))),
  });
}

/** Build the exact account-bound VIP terms reviewed before a Diamond debit. */
export function vipDiamondOfferConfirmation(accountIdValue, rawPlan) {
  const accountId = verifiedAccountId(accountIdValue);
  if (!accountId || !rawPlan || typeof rawPlan !== 'object' || Array.isArray(rawPlan)) return null;
  const plan = String(rawPlan.plan || rawPlan.planKey || rawPlan.id || '')
    .replace(/^vip-/, '')
    .toLowerCase();
  const cost = exactPositiveDiamondAmount(
    rawPlan.cost ?? rawPlan.priceDiamonds ?? rawPlan.price_diamonds
  );
  if (!['monthly', 'yearly', 'lifetime'].includes(plan) || cost === null) return null;
  return Object.freeze({
    version: 1,
    accountId,
    type: 'vip_diamonds',
    currency: 'diamonds',
    plan,
    cost,
  });
}

export function checkoutRequestReplacementRequired(error) {
  return CHECKOUT_REQUEST_REPLACEMENT_CODES.has(String(error?.code || ''));
}

/**
 * Accept only the hosted payment surface this application intentionally
 * leaves for. A truthy value is not a safe navigation contract: malformed,
 * non-HTTPS, credential-bearing, or unapproved URLs remain on the current
 * Marketplace page and preserve the durable checkout request for recovery.
 */
export function normalizeVerifiedCheckoutUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_CHECKOUT_URL_LENGTH) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !VERIFIED_CHECKOUT_HOSTS.has(url.hostname.toLowerCase()) ||
      url.port ||
      url.pathname === '/'
    )
      return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

/**
 * Bind the browser redirect to the exact durable request that initiated it.
 * A success flag or an allow-listed URL by itself is insufficient: the route
 * must echo the request identity, return a real Stripe Checkout session id,
 * and return the hosted URL for that same session.
 */
export function normalizeVerifiedCheckoutSession(payload, expectedRequestId, expectedOffer) {
  const requestId = typeof expectedRequestId === 'string' ? expectedRequestId.trim() : '';
  if (
    !CHECKOUT_REQUEST_ID_RE.test(requestId) ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.success !== true ||
    !payload.data ||
    typeof payload.data !== 'object' ||
    Array.isArray(payload.data) ||
    payload.data.request_id !== requestId ||
    arguments.length < 3 ||
    !expectedOffer ||
    typeof expectedOffer !== 'object' ||
    Array.isArray(expectedOffer) ||
    !Object.prototype.hasOwnProperty.call(payload.data, 'offer') ||
    !exactJsonValueMatches(payload.data.offer, expectedOffer)
  )
    return null;

  const sessionId = payload.data.session_id;
  if (typeof sessionId !== 'string' || !STRIPE_CHECKOUT_SESSION_ID_RE.test(sessionId)) {
    return null;
  }
  const url = normalizeVerifiedCheckoutUrl(payload.data.url);
  if (!url) return null;

  try {
    const pathSegments = new URL(url).pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    if (!pathSegments.includes(sessionId)) return null;
  } catch (_) {
    return null;
  }

  return Object.freeze({
    requestId,
    sessionId,
    url,
    duplicate: payload.duplicate === true,
    offer: payload.data.offer,
  });
}

function normalizedNullableString(value, maxLength) {
  if (value === null) return { valid: true, value: null };
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    value !== value.trim()
  )
    return { valid: false, value: null };
  return { valid: true, value };
}

function normalizedCheckoutCartItems(value) {
  if (!Array.isArray(value) || value.length > 50) return null;
  const result = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const keys = Object.keys(raw).sort();
    if (!exactJsonValueMatches(keys, ['id', 'kind', 'quantity', 'variantId'])) return null;
    const kind = raw.kind;
    const id = normalizedNullableString(raw.id, 128);
    const variantId =
      raw.variantId === null
        ? { valid: true, value: null }
        : normalizedNullableString(raw.variantId, 128);
    const quantity = Number(raw.quantity);
    if (
      !['diamonds', 'merchandise'].includes(kind) ||
      !id.valid ||
      !variantId.valid ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    )
      return null;
    result.push(Object.freeze({ kind, id: id.value, variantId: variantId.value, quantity }));
  }
  return Object.freeze(result);
}

/**
 * Verify the authenticated checkout-status boundary before any response value
 * can update wallet state, cart state, analytics, or durable request storage.
 */
export function normalizeVerifiedCheckoutStatus(payload, expected = {}) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.success !== true ||
    !payload.data ||
    typeof payload.data !== 'object' ||
    Array.isArray(payload.data)
  )
    return null;

  const data = payload.data;
  const sessionId = typeof expected.sessionId === 'string' ? expected.sessionId.trim() : '';
  const accountId = verifiedAccountId(expected.accountId);
  if (
    !STRIPE_CHECKOUT_SESSION_ID_RE.test(sessionId) ||
    !accountId ||
    data.sessionId !== sessionId ||
    data.accountId !== accountId ||
    !CHECKOUT_REQUEST_ID_RE.test(String(data.requestId || '')) ||
    !CHECKOUT_STATUS_TYPES.has(data.type) ||
    !CHECKOUT_RECORD_STATUSES.has(data.status) ||
    !CHECKOUT_PAYMENT_STATUSES.has(data.paymentStatus) ||
    !CHECKOUT_SESSION_STATUSES.has(data.sessionStatus) ||
    data.currency !== 'usd'
  )
    return null;

  const orderId = normalizedNullableString(data.orderId, 160);
  const label = normalizedNullableString(data.label, 200);
  const purchaseKind = normalizedNullableString(data.purchaseKind, 64);
  const itemId = normalizedNullableString(data.itemId, 160);
  const redemptionStatus = normalizedNullableString(data.redemptionStatus, 64);
  const redemptionError = normalizedNullableString(data.redemptionError, 500);
  const cartItems = normalizedCheckoutCartItems(data.cartItems);
  const walletBalance =
    data.walletBalance === null
      ? null
      : Number.isSafeInteger(data.walletBalance) &&
          data.walletBalance >= (data.type === 'diamonds' ? POSTGRES_INT4_MIN : 0) &&
          data.walletBalance <= POSTGRES_INT4_MAX
        ? data.walletBalance
        : undefined;
  const amountTotal =
    data.amountTotal === null
      ? null
      : Number.isSafeInteger(data.amountTotal) && data.amountTotal >= 0
        ? data.amountTotal
        : undefined;
  const diamonds =
    data.diamonds === null
      ? null
      : Number.isSafeInteger(data.diamonds) && data.diamonds >= 0
        ? data.diamonds
        : undefined;
  const orderSource = data.orderSource;
  const expectedOrderSource =
    data.type === 'diamonds' ? 'diamonds' : data.type === 'merchandise' ? 'merchandise' : 'vip';

  if (
    !orderId.valid ||
    !label.valid ||
    !purchaseKind.valid ||
    !itemId.valid ||
    !redemptionStatus.valid ||
    !redemptionError.valid ||
    cartItems === null ||
    walletBalance === undefined ||
    amountTotal === undefined ||
    diamonds === undefined ||
    (orderSource !== null && orderSource !== expectedOrderSource) ||
    (data.status === 'complete' &&
      (data.paymentStatus !== 'paid' ||
        data.sessionStatus !== 'complete' ||
        !orderId.value ||
        orderSource !== expectedOrderSource)) ||
    (data.status === 'failed' &&
      (data.paymentStatus !== 'unpaid' || data.sessionStatus !== 'expired')) ||
    (data.status === 'pending' && data.sessionStatus === 'expired')
  )
    return null;

  return Object.freeze({
    status: data.status,
    sessionId,
    accountId,
    requestId: data.requestId,
    type: data.type,
    paymentStatus: data.paymentStatus,
    sessionStatus: data.sessionStatus,
    amountTotal,
    currency: 'usd',
    label: label.value,
    purchaseKind: purchaseKind.value,
    itemId: itemId.value,
    diamonds,
    walletBalance,
    redemptionStatus: redemptionStatus.value,
    redemptionError: redemptionError.value,
    orderId: orderId.value,
    orderSource,
    cartItems,
  });
}

export {
  CHECKOUT_REQUEST_ID_RE,
  CHECKOUT_REQUEST_REPLACEMENT_CODES,
  CHECKOUT_STATUS_TYPES,
  STRIPE_CHECKOUT_SESSION_ID_RE,
  VERIFIED_CHECKOUT_HOSTS,
};
