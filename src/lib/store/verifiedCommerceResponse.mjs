const COMMERCE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATALOG_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const COMMERCE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,180}$/;
const FULFILLMENT_MODES = new Set(['automatic', 'manual', 'none']);
const DEFINITIVE_MERCH_REFUSAL_CODES = new Set([
  'INVALID_ITEMS',
  'ITEM_UNAVAILABLE',
  'SHIPPING_ADDRESS_INCOMPLETE',
  'insufficient_diamonds',
  'duplicate_lines',
  'insufficient_stock',
  'variant_required',
  'variant_unavailable',
  'variant_not_applicable',
  'item_unavailable',
  'unpriced_item',
  'price_changed',
]);

function normalizedExpectedItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) return null;
  const seen = new Set();
  const items = [];
  for (const item of raw) {
    const id = item?.id;
    const variantId = item?.variantId ?? item?.variant_id ?? null;
    const quantity = item?.quantity ?? item?.qty;
    const identity = `${id || ''}\u0000${variantId || ''}`;
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      typeof id !== 'string' ||
      !CATALOG_KEY_PATTERN.test(id) ||
      !(
        variantId === null ||
        (typeof variantId === 'string' && CATALOG_KEY_PATTERN.test(variantId))
      ) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 10 ||
      seen.has(identity)
    )
      return null;
    seen.add(identity);
    items.push({ id, variantId, quantity, identity });
  }
  return items;
}

export function normalizeVerifiedMerchDiamondPurchase(raw, expected = {}) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.success !== true ||
    typeof raw.idempotent !== 'boolean' ||
    typeof raw.duplicate !== 'boolean' ||
    raw.idempotent !== raw.duplicate ||
    !raw.data ||
    typeof raw.data !== 'object' ||
    Array.isArray(raw.data)
  )
    return null;
  const data = raw.data;
  const expectedAccountId = expected.accountId;
  const expectedRequestId = expected.requestId;
  const expectedUnits = expected.units;
  const expectedItems = normalizedExpectedItems(expected.items);
  const responseItems = normalizedExpectedItems(data.items);
  const responseByIdentity = responseItems
    ? new Map(responseItems.map((item) => [item.identity, item]))
    : null;
  const fulfillmentStatusValid =
    data.fulfillment_status === null ||
    (typeof data.fulfillment_status === 'string' &&
      data.fulfillment_status.trim().length > 0 &&
      data.fulfillment_status.length <= 80);
  const responseUnits = responseItems?.reduce((sum, item) => sum + item.quantity, 0);
  if (
    !COMMERCE_UUID.test(String(expectedAccountId || '')) ||
    raw.accountId !== expectedAccountId ||
    typeof expectedRequestId !== 'string' ||
    !COMMERCE_REQUEST_ID_PATTERN.test(expectedRequestId) ||
    raw.requestId !== expectedRequestId ||
    !Number.isSafeInteger(expectedUnits) ||
    expectedUnits < 1 ||
    !Number.isSafeInteger(expected.diamondsSpent) ||
    expected.diamondsSpent <= 0 ||
    data.diamonds_spent !== expected.diamondsSpent ||
    !expectedItems ||
    !responseItems ||
    expectedItems.length !== responseItems.length ||
    expectedItems.some(
      (item) => responseByIdentity.get(item.identity)?.quantity !== item.quantity
    ) ||
    !COMMERCE_UUID.test(String(data.order_id || '')) ||
    data.currency !== 'diamonds' ||
    !Number.isSafeInteger(data.diamonds_spent) ||
    data.diamonds_spent <= 0 ||
    !Number.isSafeInteger(data.new_balance) ||
    data.new_balance < 0 ||
    responseUnits !== expectedUnits ||
    !Number.isSafeInteger(data.items_purchased) ||
    data.items_purchased !== responseUnits ||
    typeof data.total_usd !== 'number' ||
    !Number.isFinite(data.total_usd) ||
    data.total_usd <= 0 ||
    !FULFILLMENT_MODES.has(data.fulfillment_mode) ||
    !fulfillmentStatusValid
  )
    return null;
  return Object.freeze({
    accountId: raw.accountId,
    requestId: raw.requestId,
    orderId: data.order_id,
    currency: data.currency,
    diamondsSpent: data.diamonds_spent,
    newBalance: data.new_balance,
    itemsPurchased: data.items_purchased,
    items: responseItems.map(({ id, variantId, quantity }) => ({ id, variantId, quantity })),
    totalUsd: data.total_usd,
    fulfillmentMode: data.fulfillment_mode,
    fulfillmentStatus: data.fulfillment_status,
    duplicate: raw.duplicate,
    idempotent: raw.idempotent,
  });
}

export function classifyMerchDiamondPurchaseRefusal(status, body = null, expected = {}) {
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
    // A reference conflict proves only that this durable request identity is
    // already bound elsewhere. It does not prove that the earlier operation
    // failed before mutation, so preserve the key for reconciliation.
    definitive:
      responseIsBound &&
      [400, 409, 413, 422].includes(responseStatus) &&
      DEFINITIVE_MERCH_REFUSAL_CODES.has(code),
    code,
    responseIsBound,
  });
}
