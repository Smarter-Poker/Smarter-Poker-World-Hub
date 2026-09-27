/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CLUB SHOP OPERATOR DRAFT RULES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  The retired Club Arena Manage tab could edit an existing offer in place.
 *  The Hub's Club Shop Manage view could only create, hide, activate and
 *  delete, so club owners lost restocking, ending a sale, moving a promo
 *  window and re-ordering the storefront when /marketplace handed its traffic
 *  to these pages.
 *
 *  This module is the pure half of that editor: it turns a form draft into the
 *  exact body /api/club-arena/manage-shop expects for `action: 'update'`, and
 *  nothing else. It computes no price and asserts no authority. Every value it
 *  emits is a field the operator typed; the server re-reads the row, re-derives
 *  the grant, re-checks the Card-funded price ceiling and decides.
 *
 *  Three rules the old tab paid for and this keeps:
 *
 *  1. BLANK IS A VALUE, NOT AN OMISSION. `stock` blank means unlimited,
 *     `salePrice` blank ends the sale, `perUserLimit` blank removes the cap,
 *     and a blank availability bound clears it. Omitting those keys is what
 *     made a promo write-once: a sale could be started and never ended except
 *     by hiding the item. The route reads `null` as clear and `undefined` as
 *     leave alone, so blank must travel as an explicit `null`.
 *
 *  2. A DATETIME-LOCAL VALUE CARRIES NO OFFSET. "2026-08-20T18:00" is LOCAL
 *     wall-clock time per spec, and the server parses what it is sent under
 *     UTC. Sending it raw shifted every window by the operator's offset (an
 *     admin in UTC+10 setting 18:00 got 04:00 the next day), so it is
 *     converted to a real instant here.
 *
 *  3. AN ITEM WITH SALES IS HIDDEN, NEVER DELETED. club_shop_purchases.item_id
 *     is ON DELETE CASCADE, so a hard delete erases the club's purchase
 *     history. The server refuses it; this refuses it before the operator
 *     spends a confirmation on it, and says which control to use instead.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Categories this storefront can sell today, mirroring the create control. */
export const CLUB_SHOP_EDITABLE_CATEGORIES = Object.freeze(['Time Banks']);

/**
 * THE ONE PLATFORM-MANAGED ROW.
 *
 * `enforceAllThrowablesMutation` on /api/club-arena/manage-shop refuses the
 * WHOLE update when the canonical All Throwables Pack arrives with a name,
 * description, category, image, grant quantity or per-member cap that differs
 * from the platform constants, and its refusal names no field. Offering those
 * controls for that row therefore sold the operator a form the server must
 * refuse: a price change typed beside them was lost to a message nobody could
 * act on. The editor offers only the commercial terms for this row, and the
 * payload omits the rest. An omitted field is not a requested change, so the
 * route normalizes it to the platform value itself.
 */
export const CLUB_SHOP_ALL_THROWABLES_NAME = 'All Throwables Pack (10)';

/** The keys the server refuses to see changed on that one row. */
export const CLUB_SHOP_PLATFORM_MANAGED_FIELDS = Object.freeze([
  'name',
  'description',
  'category',
  'imageUrl',
  'grantQty',
  'grantRef',
  'perUserLimit',
]);

/** Whether this row is the canonical, active All Throwables Pack. */
export function clubShopItemIsPlatformManaged(item) {
  if (!item) return false;
  const isThrowable =
    String(item.category || '').toLowerCase() === 'throwables' ||
    String(item.item_type || '').toLowerCase() === 'throwable' ||
    item.grant_spec?.type === 'throwable';
  return (
    isThrowable &&
    String(item.name || '')
      .trim()
      .toLowerCase() === CLUB_SHOP_ALL_THROWABLES_NAME.toLowerCase() &&
    item.is_active === true
  );
}

/** grant_spec.type by category, mirroring src/lib/club-arena/shopItemRules. */
const GRANT_TYPE_BY_CATEGORY = Object.freeze({
  'Time Banks': 'time_bank',
  'Table Skins': 'table_skin',
  Throwables: 'throwable',
  Emotes: 'emote_pack',
  Avatars: 'avatar',
  Exclusive: 'none',
});

/** Grant types whose quantity an operator chooses. */
const QUANTITY_GRANT_TYPES = Object.freeze(['time_bank', 'throwable']);

/** Grant types that are meaningless without an identifier to unlock. */
const REFERENCE_GRANT_TYPES = Object.freeze(['table_skin', 'avatar']);

export const MAX_GRANT_QTY = 1000;
export const MAX_SORT_ORDER = 10000;
export const MAX_STOCK = 1000000;

export const CLUB_SHOP_ITEM_DELETE_BLOCKED_REASON =
  'This Item Has Sales. Deleting It Would Erase Its Purchase History. Hide It Instead.';

export function clubShopGrantTypeForCategory(category) {
  return GRANT_TYPE_BY_CATEGORY[String(category || '')] || 'none';
}

export function clubShopGrantTakesQuantity(category) {
  return QUANTITY_GRANT_TYPES.includes(clubShopGrantTypeForCategory(category));
}

export function clubShopGrantTakesReference(category) {
  return REFERENCE_GRANT_TYPES.includes(clubShopGrantTypeForCategory(category));
}

/**
 * `<input type="datetime-local">` yields "2026-08-20T18:00" with no timezone
 * designator, which the spec defines as LOCAL time. Returns null for blank so
 * the caller can clear the field, and null for anything unparseable rather
 * than inventing an instant.
 */
export function localInputToIso(local) {
  const value = String(local ?? '').trim();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Inverse: a stored instant back into a datetime-local value in local time. */
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}` +
    `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  );
}

const numericField = (value) =>
  value === null || value === undefined ? '' : String(value);

/** Seed the editor from the row the operator report returned. */
export function createClubShopItemDraft(item) {
  const source = item || {};
  return {
    name: String(source.name || ''),
    price: numericField(source.price),
    description: String(source.description || ''),
    // Preserve an unrecognised category rather than silently rewriting it and
    // then persisting that rewrite the next time the operator saves a price.
    category: String(source.category || 'Time Banks'),
    imageUrl: String(source.image_url || ''),
    grantQty: numericField(source.grant_spec?.qty ?? 1),
    grantRef: String(source.grant_spec?.theme_id || source.grant_spec?.avatar_id || ''),
    stock: numericField(source.stock),
    salePrice: numericField(source.sale_price),
    perUserLimit: numericField(source.per_user_limit),
    availableFrom: isoToLocalInput(source.available_from),
    availableUntil: isoToLocalInput(source.available_until),
    sortOrder: numericField(source.sort_order),
  };
}

/** The category options an operator may pick for this row. */
export function clubShopEditableCategories(currentCategory) {
  const current = String(currentCategory || '').trim();
  if (!current || CLUB_SHOP_EDITABLE_CATEGORIES.includes(current)) {
    return [...CLUB_SHOP_EDITABLE_CATEGORIES];
  }
  return [current, ...CLUB_SHOP_EDITABLE_CATEGORIES];
}

function boundedInteger(raw, { min, max, label, blankAllowed = true }) {
  const value = String(raw ?? '').trim();
  if (!value) {
    if (blankAllowed) return { value: null };
    return { error: `${label} Is Required.` };
  }
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { error: `${label} Must Be A Whole Number From ${min} Through ${max}.` };
  }
  return { value: parsed };
}

/**
 * Everything the browser can prove before it spends a request. The server
 * repeats all of it: this only keeps an operator from waiting on a round trip
 * to be told their sale price is above their list price.
 */
export function validateClubShopItemDraft(draft, options = {}) {
  const maximumCardFundedPrice = options.maximumCardFundedPrice;
  const source = draft || {};

  if (!String(source.name || '').trim()) return { error: 'Item Name Required.' };

  const price = boundedInteger(source.price, {
    min: 1,
    max: 1000000000,
    label: 'Price',
    blankAllowed: false,
  });
  if (price.error) return { error: price.error };

  if (!Number.isSafeInteger(maximumCardFundedPrice) || maximumCardFundedPrice <= 0) {
    return { error: 'Current Card Price Limit Is Unavailable. Please Retry.' };
  }
  if (price.value > maximumCardFundedPrice) {
    return {
      error: `Price Cannot Exceed ${maximumCardFundedPrice.toLocaleString('en-US')} Diamonds.`,
    };
  }

  const stock = boundedInteger(source.stock, { min: 0, max: MAX_STOCK, label: 'Stock' });
  if (stock.error) return { error: stock.error };

  const salePrice = boundedInteger(source.salePrice, {
    min: 0,
    max: 1000000000,
    label: 'Sale Price',
  });
  if (salePrice.error) return { error: salePrice.error };
  // club_shop_items_sale_price_valid enforces sale_price <= price. Without
  // this, lowering the price under a live sale surfaced as a bare 500.
  if (salePrice.value !== null && salePrice.value > price.value) {
    return {
      error:
        `Sale Price Cannot Exceed The Price (${price.value.toLocaleString('en-US')}). ` +
        'Lower The Sale Price First.',
    };
  }

  const perUserLimit = boundedInteger(source.perUserLimit, {
    min: 1,
    max: MAX_STOCK,
    label: 'Max Per Member',
  });
  if (perUserLimit.error) return { error: perUserLimit.error };

  const sortOrder = boundedInteger(source.sortOrder, {
    min: -MAX_SORT_ORDER,
    max: MAX_SORT_ORDER,
    label: 'Sort Order',
  });
  if (sortOrder.error) return { error: sortOrder.error };

  const takesQuantity = clubShopGrantTakesQuantity(source.category);
  let grantQty = { value: null };
  if (takesQuantity) {
    grantQty = boundedInteger(source.grantQty, {
      min: 1,
      max: MAX_GRANT_QTY,
      label: 'Uses Delivered',
      blankAllowed: false,
    });
    if (grantQty.error) return { error: grantQty.error };
  }

  const availableFrom = localInputToIso(source.availableFrom);
  if (String(source.availableFrom ?? '').trim() && availableFrom === null) {
    return { error: 'Available From Must Be A Real Date And Time.' };
  }
  const availableUntil = localInputToIso(source.availableUntil);
  if (String(source.availableUntil ?? '').trim() && availableUntil === null) {
    return { error: 'Available Until Must Be A Real Date And Time.' };
  }
  if (availableFrom && availableUntil && Date.parse(availableUntil) <= Date.parse(availableFrom)) {
    return { error: 'Available Until Must Be After Available From.' };
  }

  return {
    price: price.value,
    stock: stock.value,
    salePrice: salePrice.value,
    perUserLimit: perUserLimit.value,
    sortOrder: sortOrder.value,
    grantQty: grantQty.value,
    availableFrom,
    availableUntil,
  };
}

/**
 * The exact `action: 'update'` body for /api/club-arena/manage-shop.
 *
 * No price is computed and no authority is claimed: the ids and the operator's
 * own field values travel, and the server owns the decision.
 */
export function buildClubShopItemUpdatePayload({ clubId, item, draft, maximumCardFundedPrice }) {
  const itemId = item?.id;
  if (!clubId || !itemId) return { error: 'The Club Shop Changed. Reload Before Saving.' };
  // A row from one club can never be edited against another club's id.
  if (item?.club_id && item.club_id !== clubId) {
    return { error: 'The Club Shop Changed. Reload The Current Club Before Managing.' };
  }

  const checked = validateClubShopItemDraft(draft, { maximumCardFundedPrice });
  if (checked.error) return { error: checked.error };

  const category = String(draft.category || '').trim();
  const payload = {
    action: 'update',
    clubId,
    itemId,
    name: String(draft.name).trim(),
    price: checked.price,
    description: String(draft.description ?? '').trim() || null,
    category,
    imageUrl: String(draft.imageUrl ?? '').trim() || null,
    // Explicit null clears. This is the half that makes restocking, ending a
    // sale and removing a cap reachable at all.
    stock: checked.stock,
    salePrice: checked.salePrice,
    perUserLimit: checked.perUserLimit,
    availableFrom: checked.availableFrom,
    availableUntil: checked.availableUntil,
    // The route reads a blank sort order as 0, which is the storefront default.
    sortOrder: checked.sortOrder === null ? 0 : checked.sortOrder,
  };

  // The grant must travel with the category, or the card advertises one thing
  // and redemption delivers another. Quantity only where the grant counts uses,
  // reference only where the grant unlocks a specific thing.
  if (clubShopGrantTakesQuantity(category)) payload.grantQty = checked.grantQty;
  if (clubShopGrantTakesReference(category)) {
    payload.grantRef = String(draft.grantRef ?? '').trim();
  }

  // The platform-managed row keeps only the terms the server accepts from a
  // club. Everything else is dropped rather than sent back unchanged, because
  // a present-and-equal value is still a requested change to that guard.
  if (clubShopItemIsPlatformManaged(item)) {
    for (const key of CLUB_SHOP_PLATFORM_MANAGED_FIELDS) delete payload[key];
  }

  return { payload };
}

/**
 * A durable request key for one operator save.
 *
 * manage-shop requires `X-Idempotency-Key` (at least eight characters) so a
 * laggy network cannot apply the same write twice. It must be FRESH per save:
 * a stable key would make a second, genuinely different edit of the same row
 * inside the cache window replay the first response without applying anything.
 * crypto.randomUUID is undefined on non-secure origins and older Safari, so the
 * fallback must not throw there.
 */
export function clubShopOperatorRequestId() {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) return `club-shop-update-${cryptoApi.randomUUID()}`;
  return `club-shop-update-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Whether this row may be hard deleted, and what to do instead when it may not.
 * Gross purchases decide it, because the server's guard counts every ledger row
 * for the item, refunded ones included.
 */
export function clubShopItemDeleteGuard(item) {
  const sales = Number(item?.purchase_count) || 0;
  if (sales > 0) {
    return { canDelete: false, reason: CLUB_SHOP_ITEM_DELETE_BLOCKED_REASON };
  }
  return { canDelete: true, reason: null };
}
