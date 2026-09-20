const PUBLIC_CATALOG_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const COMMERCE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMERCE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Validate the public Diamond-package serialization before any card action is
 * enabled. Coercion is deliberately forbidden here: the live server contract
 * must already contain exact JSON numbers and booleans.
 */
export function normalizeVerifiedDiamondPackages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const seen = new Set();
  const packages = [];
  for (const item of raw) {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      typeof item.id !== 'string' ||
      !PUBLIC_CATALOG_ID.test(item.id) ||
      seen.has(item.id) ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name === item.id ||
      !Number.isSafeInteger(item.diamonds) ||
      item.diamonds <= 0 ||
      !Number.isSafeInteger(item.bonus) ||
      item.bonus < 0 ||
      typeof item.price !== 'number' ||
      !Number.isFinite(item.price) ||
      item.price <= 0 ||
      !Number.isSafeInteger(item.priceCents) ||
      item.priceCents <= 0 ||
      Math.round(item.price * 100) !== item.priceCents ||
      typeof item.popular !== 'boolean' ||
      typeof item.hasDiscount !== 'boolean' ||
      item.hasDiscount !== item.bonus > 0 ||
      item.cardCheckoutReady !== true ||
      item.diamondCheckoutReady !== false
    )
      return null;
    seen.add(item.id);
    packages.push(
      Object.freeze({
        id: item.id,
        name: item.name,
        diamonds: item.diamonds,
        bonus: item.bonus,
        price: item.price,
        priceCents: item.priceCents,
        popular: item.popular,
        hasDiscount: item.hasDiscount,
      })
    );
  }
  return Object.freeze(packages);
}

const VIP_PLAN_DAYS = Object.freeze({ monthly: 30, yearly: 365, lifetime: null });
const VIP_ALLOWED_RESULT_TIERS = Object.freeze({
  monthly: new Set(['monthly', 'yearly']),
  yearly: new Set(['yearly']),
  lifetime: new Set(['lifetime']),
});
const DEFINITIVE_VIP_CODES = new Set([
  'ACTIVE_SUBSCRIPTION_EXISTS',
  'ALREADY_LIFETIME',
  'CARD_CHECKOUT_EXISTS',
  'INSUFFICIENT_DIAMONDS',
  'OFFER_PRICE_CHANGED',
]);

export function normalizeVerifiedVipDiamondPurchase(raw, expected, now = Date.now()) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    !expected ||
    typeof expected !== 'object' ||
    Array.isArray(expected)
  )
    return null;
  const plan = expected.plan;
  const cost = expected.cost;
  const expectedAccountId = expected.accountId;
  const expectedRequestId = expected.requestId;
  const expectedDays = VIP_PLAN_DAYS[plan];
  const expiry =
    raw.expiresAt === null
      ? null
      : typeof raw.expiresAt === 'string' && Number.isFinite(Date.parse(raw.expiresAt))
        ? raw.expiresAt
        : undefined;
  const expiryMillis = typeof expiry === 'string' ? Date.parse(expiry) : null;
  const historical = plan !== 'lifetime' && Number.isFinite(expiryMillis) && expiryMillis <= now;
  if (
    !Object.prototype.hasOwnProperty.call(VIP_PLAN_DAYS, plan) ||
    !Number.isFinite(now) ||
    !Number.isSafeInteger(cost) ||
    cost <= 0 ||
    !COMMERCE_UUID.test(String(expectedAccountId || '')) ||
    raw.accountId !== expectedAccountId ||
    typeof expectedRequestId !== 'string' ||
    !COMMERCE_REQUEST_ID_PATTERN.test(expectedRequestId) ||
    raw.requestId !== expectedRequestId ||
    raw.success !== true ||
    raw.isVip !== true ||
    raw.plan !== plan ||
    raw.cost !== cost ||
    raw.daysAdded !== expectedDays ||
    typeof raw.duplicate !== 'boolean' ||
    typeof raw.idempotent !== 'boolean' ||
    raw.duplicate !== raw.idempotent ||
    !['monthly', 'yearly', 'lifetime'].includes(raw.tier) ||
    !VIP_ALLOWED_RESULT_TIERS[plan].has(raw.tier) ||
    !Number.isSafeInteger(raw.newBalance) ||
    raw.newBalance < 0 ||
    expiry === undefined ||
    (plan === 'lifetime' ? raw.tier !== 'lifetime' || expiry !== null : expiry === null) ||
    (historical && raw.idempotent !== true)
  ) {
    return null;
  }
  return Object.freeze({
    accountId: raw.accountId,
    requestId: raw.requestId,
    plan,
    tier: raw.tier,
    cost,
    daysAdded: raw.daysAdded,
    expiresAt: expiry,
    newBalance: raw.newBalance,
    duplicate: raw.duplicate,
    idempotent: raw.idempotent,
    historical,
  });
}

export function classifyVipDiamondPurchaseRefusal(status, body = null, expected = {}) {
  const responseStatus = Number(status);
  const code = typeof body?.code === 'string' ? body.code : '';
  const accountId = expected?.accountId;
  const requestId = expected?.requestId;
  const responseIsBound =
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    body.success === false &&
    COMMERCE_UUID.test(String(accountId || '')) &&
    typeof requestId === 'string' &&
    COMMERCE_REQUEST_ID_PATTERN.test(requestId) &&
    body?.accountId === accountId &&
    body?.requestId === requestId;
  return Object.freeze({
    definitive:
      responseIsBound && [400, 409].includes(responseStatus) && DEFINITIVE_VIP_CODES.has(code),
    code,
    responseIsBound,
  });
}
