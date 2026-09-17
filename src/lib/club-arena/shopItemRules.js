/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CLUB SHOP ITEM RULES: one definition, shared by every admin write path.
 *
 *  WHY THIS EXISTS (audit 2026-08-19, pass 4):
 *  Two routes create/edit club_shop_items:
 *    - /api/club-arena/manage-shop  (Club Arena Manage tab)
 *    - /api/club-arena/shop-items   (World Hub /hub/diamond-store Club Shop tab)
 *  Only the first had grant_spec, https image validation and the
 *  delete-with-sales guard. Items created from the World Hub therefore looked
 *  identical in the store but granted NOTHING on redeem, could carry a
 *  third-party tracking image, and could be hard-deleted -- which CASCADEs
 *  club_shop_purchases and erases the club's revenue history.
 *
 *  Both routes now import from here, so the rules cannot drift again.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const VALID_CATEGORIES = [
  'Time Banks',
  'Table Skins',
  'Throwables',
  'Emotes',
  'Avatars',
  'Exclusive',
];

// Only these offers have a tracked, currently verifiable fulfillment path in
// the installed purchase function. The remaining categories stay in the
// historical vocabulary so receipts and inactive admin rows remain readable,
// but they must not be newly sold until the Club Arena entitlement migration
// is installed, read back, and integration-proven.
const PURCHASE_ENABLED_CATEGORIES = Object.freeze(['Time Banks', 'Throwables']);
const PURCHASE_CATEGORY_INVALID_CODE = 'SHOP_ITEM_CATEGORY_UNAVAILABLE';
const PURCHASE_CATEGORY_INVALID_ERROR =
  'Category Must Be A Verified Purchasable Club Shop Category.';

// club_shop_items.item_type (display/analytics)
const ITEM_TYPE_BY_CATEGORY = {
  'Time Banks': 'time_bank',
  'Table Skins': 'table_skin',
  Throwables: 'throwable',
  Emotes: 'emote',
  Avatars: 'avatar',
  Exclusive: 'exclusive',
};

// grant_spec.type: must match the CHECK on club_shop_items and the branches
// in fn_redeem_shop_item.
const GRANT_TYPES = ['time_bank', 'throwable', 'emote_pack', 'table_skin', 'avatar', 'none'];
const DELIVERABLE_GRANT_TYPES = Object.freeze(['time_bank', 'throwable']);
const GRANT_TYPE_BY_CATEGORY = {
  'Time Banks': 'time_bank',
  'Table Skins': 'table_skin',
  Throwables: 'throwable',
  Emotes: 'emote_pack',
  Avatars: 'avatar',
  Exclusive: 'none',
};
const FULFILLMENT_REQUIRED_CODE = 'SHOP_ITEM_FULFILLMENT_REQUIRED';
const FULFILLMENT_REQUIRED_ERROR =
  'A Paid Shop Item Must Have An Executable Digital Grant Before It Can Be Sold.';

function isDeliverableShopItem(item) {
  const category = String(item?.category || '');
  const type = String(item?.grant_spec?.type || '');
  const expectedType = GRANT_TYPE_BY_CATEGORY[category];
  const expectedItemType = ITEM_TYPE_BY_CATEGORY[category];
  if (
    !PURCHASE_ENABLED_CATEGORIES.includes(category) ||
    !DELIVERABLE_GRANT_TYPES.includes(type) ||
    type !== expectedType ||
    item?.item_type !== expectedItemType ||
    item?.stackable !== true
  ) {
    return false;
  }
  // This name is a platform identity, not reusable display copy. Without this
  // check a Time Bank could impersonate the All Throwables product art while
  // delivering a completely different benefit.
  if (item?.name === ALL_THROWABLES_NAME && type !== 'throwable') return false;
  if (type === 'time_bank') {
    const qty = Number(item?.grant_spec?.qty);
    return Number.isInteger(qty) && qty > 0 && qty <= MAX_GRANT_QTY;
  }
  return (
    isAllThrowablesOffer(item) && Number(item?.grant_spec?.qty) === ALL_THROWABLES_GRANT_SPEC.qty
  );
}

/**
 * Historical `none` rows stay readable for receipts, but they cannot remain a
 * paid no-op. They may be deactivated or converted to a real digital grant;
 * an inactive no-op can never be reactivated.
 */
function enforceFulfillableMutation(action, body = {}, existingItem = null) {
  const refusal = {
    error: FULFILLMENT_REQUIRED_ERROR,
    code: FULFILLMENT_REQUIRED_CODE,
  };
  if (action === 'toggle') {
    if (!isDeliverableShopItem(existingItem) && existingItem?.is_active !== true) return refusal;
    return { allowed: true };
  }
  if (action !== 'update') return { allowed: true };

  const currentGrant = existingItem?.grant_spec || {};
  const currentType = String(currentGrant.type || '');
  const nextCategory = body.category !== undefined ? body.category : existingItem?.category;
  const grantChanged =
    body.category !== undefined ||
    body.grantType !== undefined ||
    body.grantQty !== undefined ||
    body.grantRef !== undefined;
  let nextGrant = currentGrant;
  if (grantChanged) {
    const nextType =
      body.grantType !== undefined
        ? body.grantType
        : body.category !== undefined
          ? GRANT_TYPE_BY_CATEGORY[nextCategory] || 'none'
          : currentType;
    const nextQty = body.grantQty !== undefined ? body.grantQty : currentGrant.qty;
    const nextRef =
      body.grantRef !== undefined ? body.grantRef : currentGrant.theme_id || currentGrant.avatar_id;
    const built = buildGrantSpec(nextCategory, nextType, nextQty, nextRef);
    if (built.error) return refusal;
    nextGrant = built.spec;
  }
  const candidate = {
    ...existingItem,
    name: body.name !== undefined ? String(body.name).trim() : existingItem?.name,
    category: nextCategory,
    item_type: ITEM_TYPE_BY_CATEGORY[nextCategory] || existingItem?.item_type,
    grant_spec: nextGrant,
    is_active: body.isActive !== undefined ? body.isActive === true : existingItem?.is_active,
    stackable: body.stackable !== undefined ? body.stackable === true : existingItem?.stackable,
  };
  const targetIsDeliverable = isDeliverableShopItem(candidate);

  if (targetIsDeliverable) return { allowed: true };
  if (!isDeliverableShopItem(existingItem) && body.isActive === false) return { allowed: true };
  return refusal;
}

/** Default quantity for qty-bearing grants when a caller does not specify one. */
const DEFAULT_GRANT_QTY = 1;
const MAX_GRANT_QTY = 1000;

function normalizePurchaseCategory(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!PURCHASE_ENABLED_CATEGORIES.includes(value)) {
    return {
      error: PURCHASE_CATEGORY_INVALID_ERROR,
      code: PURCHASE_CATEGORY_INVALID_CODE,
    };
  }
  return { value };
}

// The throwable catalog is a platform contract, not club-authored inventory.
// A member buys ten generic uses and may spend them on any of the 49 table
// throwables. The database enforces the same identity; these API rules turn a
// constraint failure into an intentional, actionable response.
const ALL_THROWABLES_NAME = 'All Throwables Pack (10)';
const ALL_THROWABLES_DESCRIPTION =
  'Ten Uses Across All 49 Table Throwables, Including Boxing Gloves, Water Guns, Eggs, Tomatoes, Snowballs, And More.';
const ALL_THROWABLES_IMAGE_URL =
  '/hub/club-arena/images/marketplace/throwables/all-throwables-access-v1.png';
const ALL_THROWABLES_GRANT_SPEC = Object.freeze({ type: 'throwable', qty: 10 });
const THROWABLES_PLATFORM_MANAGED_CODE = 'THROWABLES_OFFER_PLATFORM_MANAGED';
const THROWABLES_PLATFORM_MANAGED_ERROR =
  'All Throwables Pack (10) is managed by Smarter.Poker. Clubs may change its price, stock, sale window, and display order, but cannot create, hide, delete, rename, or split it into item-specific packs.';

function isThrowableItem(item) {
  return (
    Boolean(item) &&
    (item.category === 'Throwables' ||
      item.item_type === 'throwable' ||
      item.grant_spec?.type === 'throwable')
  );
}

function isAllThrowablesOffer(item) {
  return isThrowableItem(item) && item.name === ALL_THROWABLES_NAME && item.is_active === true;
}

function requestsThrowableItem(body) {
  return Boolean(body) && (body.category === 'Throwables' || body.grantType === 'throwable');
}

function requestsReservedAllThrowablesName(body) {
  return (
    Boolean(body) && body.name !== undefined && String(body.name).trim() === ALL_THROWABLES_NAME
  );
}

/**
 * Guard the platform-owned throwable offer before either admin route writes.
 *
 * - create: clubs cannot create a second/item-specific throwable offer;
 * - update: commercial fields remain editable, while identity fields are
 *   rejected when they conflict and normalized when omitted/canonical;
 * - toggle/delete: the one active offer cannot be hidden or removed.
 */
function enforceAllThrowablesMutation(action, body = {}, existingItem = null) {
  const existingIsThrowable = isThrowableItem(existingItem);
  const requestedAsThrowable = requestsThrowableItem(body);
  const requestedReservedName = requestsReservedAllThrowablesName(body);
  const refusal = {
    error: THROWABLES_PLATFORM_MANAGED_ERROR,
    code: THROWABLES_PLATFORM_MANAGED_CODE,
  };

  if (action === 'create' && (requestedAsThrowable || requestedReservedName)) return refusal;

  if (action === 'update') {
    // A different catalog row cannot be converted into a second platform
    // throwable offer.
    if (!existingIsThrowable && (requestedAsThrowable || requestedReservedName)) return refusal;
    if (!existingIsThrowable) return { managed: false };
    // Hidden historical Tomato/Snowball/Egg rows remain readable for
    // receipts, but must never be promoted or rewritten into a second
    // active platform offer.
    if (!isAllThrowablesOffer(existingItem)) return refusal;

    const conflicts = [
      body.name !== undefined && String(body.name).trim() !== ALL_THROWABLES_NAME,
      body.description !== undefined &&
        String(body.description ?? '').trim() !== ALL_THROWABLES_DESCRIPTION,
      body.category !== undefined && body.category !== 'Throwables',
      body.imageUrl !== undefined && body.imageUrl !== ALL_THROWABLES_IMAGE_URL,
      body.grantType !== undefined && body.grantType !== 'throwable',
      body.grantQty !== undefined && Number(body.grantQty) !== 10,
      body.grantRef !== undefined && String(body.grantRef ?? '').trim() !== '',
      body.isActive !== undefined && body.isActive !== true,
      body.stackable !== undefined && body.stackable !== true,
      body.perUserLimit !== undefined &&
        body.perUserLimit !== null &&
        String(body.perUserLimit).trim() !== '',
    ];
    if (conflicts.some(Boolean)) return refusal;

    return {
      managed: true,
      updates: {
        name: ALL_THROWABLES_NAME,
        description: ALL_THROWABLES_DESCRIPTION,
        category: 'Throwables',
        item_type: 'throwable',
        grant_spec: { ...ALL_THROWABLES_GRANT_SPEC },
        image_url: ALL_THROWABLES_IMAGE_URL,
        is_active: true,
        stackable: true,
        per_user_limit: null,
      },
    };
  }

  if ((action === 'toggle' || action === 'delete') && existingIsThrowable) {
    return refusal;
  }

  return { managed: false };
}

/**
 * Build a validated grant_spec, or return { error } for a 400.
 *
 * Historical `{"type":"none"}` rows remain readable, but new or updated paid
 * items must carry an executable digital grant. A successful no-op redemption
 * is not a fulfillment contract.
 *
 * A missing time-bank grantQty defaults to 1. Throwables are the platform's
 * single generic ten-use pack and cannot carry an item-specific quantity.
 */
function buildGrantSpec(category, grantType, grantQty, grantRef) {
  const expectedType = GRANT_TYPE_BY_CATEGORY[category] || 'none';
  if (
    grantType !== undefined &&
    grantType !== null &&
    grantType !== '' &&
    !GRANT_TYPES.includes(grantType)
  ) {
    return { error: 'Invalid grantType', code: FULFILLMENT_REQUIRED_CODE };
  }
  const type = grantType || expectedType;

  if (!PURCHASE_ENABLED_CATEGORIES.includes(category) || type === 'none' || type !== expectedType) {
    return {
      error: FULFILLMENT_REQUIRED_ERROR,
      code: FULFILLMENT_REQUIRED_CODE,
    };
  }

  const spec = { type };

  if (type === 'throwable') {
    const supplied = grantQty !== undefined && grantQty !== null && grantQty !== '';
    const qty = supplied ? Number(grantQty) : ALL_THROWABLES_GRANT_SPEC.qty;
    if (!Number.isInteger(qty) || qty !== ALL_THROWABLES_GRANT_SPEC.qty) {
      return { error: 'grantQty must be exactly 10 for the All Throwables Pack' };
    }
    spec.qty = ALL_THROWABLES_GRANT_SPEC.qty;
  }
  if (type === 'time_bank') {
    const supplied = grantQty !== undefined && grantQty !== null && grantQty !== '';
    const qty = supplied ? Number(grantQty) : DEFAULT_GRANT_QTY;
    if (!Number.isSafeInteger(qty) || qty <= 0 || qty > MAX_GRANT_QTY) {
      return {
        error: `grantQty must be an integer between 1 and ${MAX_GRANT_QTY} for this grant type`,
      };
    }
    spec.qty = qty;
  }
  if (type === 'avatar') {
    spec.avatar_id =
      String(grantRef || '')
        .trim()
        .slice(0, 64) || 'club_shop_avatar';
  }
  if (type === 'table_skin') {
    spec.theme_id =
      String(grantRef || '')
        .trim()
        .slice(0, 64) || 'club_shop_theme';
  }
  return { spec };
}

/**
 * Item images must be https, or a same-origin absolute path.
 * Returns { skip } when the field was not supplied at all (partial update).
 */
function normalizeImageUrl(raw) {
  if (raw === undefined) return { skip: true };
  if (raw === null || String(raw).trim() === '') return { value: null };
  const v = String(raw).trim().slice(0, 500);
  // '//evil.example/x.gif' starts with '/' but resolves to a THIRD PARTY.
  if (v.startsWith('//')) return { error: 'imageUrl must use https' };
  if (v.startsWith('/')) return { value: v };
  let parsed;
  try {
    parsed = new URL(v);
  } catch (_e) {
    return { error: 'imageUrl must be a valid URL' };
  }
  if (parsed.protocol !== 'https:') return { error: 'imageUrl must use https' };
  return { value: v };
}

/** Clamp a name/description to the column budget. */
function trimText(v, max) {
  return v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;
}

/**
 * True when the item has sales. club_shop_purchases.item_id is ON DELETE
 * CASCADE, so hard-deleting a sold item erases its purchase history and the
 * club's revenue figures: callers must refuse and hide instead.
 */
async function itemHasSales(supabase, clubId, itemId) {
  const { data, error } = await supabase
    .from('club_shop_purchases')
    .select('id')
    .eq('club_id', clubId)
    .eq('item_id', itemId)
    .limit(1);
  if (error || !Array.isArray(data)) {
    const verificationError = new Error(PURCHASE_HISTORY_VERIFICATION_ERROR);
    verificationError.code = PURCHASE_HISTORY_VERIFICATION_CODE;
    verificationError.cause = error || undefined;
    throw verificationError;
  }
  return data.length > 0;
}

const HAS_SALES_ERROR =
  'This item has sales. Deleting it would erase its purchase history -- hide it instead.';
const PURCHASE_HISTORY_VERIFICATION_CODE = 'PURCHASE_HISTORY_VERIFICATION_FAILED';
const PURCHASE_HISTORY_VERIFICATION_ERROR =
  'Purchase history could not be verified. The item was not deleted.';

module.exports = {
  VALID_CATEGORIES,
  PURCHASE_ENABLED_CATEGORIES,
  PURCHASE_CATEGORY_INVALID_CODE,
  PURCHASE_CATEGORY_INVALID_ERROR,
  ITEM_TYPE_BY_CATEGORY,
  GRANT_TYPES,
  DELIVERABLE_GRANT_TYPES,
  GRANT_TYPE_BY_CATEGORY,
  DEFAULT_GRANT_QTY,
  MAX_GRANT_QTY,
  ALL_THROWABLES_NAME,
  ALL_THROWABLES_DESCRIPTION,
  ALL_THROWABLES_IMAGE_URL,
  ALL_THROWABLES_GRANT_SPEC,
  THROWABLES_PLATFORM_MANAGED_CODE,
  THROWABLES_PLATFORM_MANAGED_ERROR,
  isThrowableItem,
  isAllThrowablesOffer,
  requestsThrowableItem,
  requestsReservedAllThrowablesName,
  enforceAllThrowablesMutation,
  FULFILLMENT_REQUIRED_CODE,
  FULFILLMENT_REQUIRED_ERROR,
  isDeliverableShopItem,
  enforceFulfillableMutation,
  normalizePurchaseCategory,
  buildGrantSpec,
  normalizeImageUrl,
  trimText,
  itemHasSales,
  HAS_SALES_ERROR,
  PURCHASE_HISTORY_VERIFICATION_CODE,
  PURCHASE_HISTORY_VERIFICATION_ERROR,
};
