/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CLUB SHOP ITEM RULES — one definition, shared by every admin write path.
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

const VALID_CATEGORIES = ['Time Banks', 'Table Skins', 'Throwables', 'Emotes', 'Avatars', 'Exclusive'];

// club_shop_items.item_type (display/analytics)
const ITEM_TYPE_BY_CATEGORY = {
    'Time Banks': 'time_bank',
    'Table Skins': 'table_skin',
    'Throwables': 'throwable',
    'Emotes': 'emote',
    'Avatars': 'avatar',
    'Exclusive': 'exclusive',
};

// grant_spec.type — must match the CHECK on club_shop_items and the branches
// in fn_redeem_shop_item.
const GRANT_TYPES = ['time_bank', 'throwable', 'emote_pack', 'table_skin', 'avatar', 'none'];
const GRANT_TYPE_BY_CATEGORY = {
    'Time Banks': 'time_bank',
    'Table Skins': 'table_skin',
    'Throwables': 'throwable',
    'Emotes': 'emote_pack',
    'Avatars': 'avatar',
    'Exclusive': 'none',
};

/** Default quantity for qty-bearing grants when a caller does not specify one. */
const DEFAULT_GRANT_QTY = 1;
const MAX_GRANT_QTY = 1000;

/**
 * Build a validated grant_spec, or return { error } for a 400.
 *
 * Items that intentionally grant nothing are `{"type":"none"}` rather than
 * NULL, so an admin can tell "club-fulfilled perk" from "never configured".
 *
 * A missing grantQty defaults to 1 rather than erroring: callers that don't
 * know about grants (the World Hub form) must still be able to create items.
 */
function buildGrantSpec(category, grantType, grantQty, grantRef) {
    const type = GRANT_TYPES.includes(grantType)
        ? grantType
        : (GRANT_TYPE_BY_CATEGORY[category] || 'none');

    const spec = { type };

    if (type === 'time_bank' || type === 'throwable') {
        const supplied = grantQty !== undefined && grantQty !== null && grantQty !== '';
        const qty = supplied ? Math.floor(Number(grantQty)) : DEFAULT_GRANT_QTY;
        if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_GRANT_QTY) {
            return { error: `grantQty must be an integer between 1 and ${MAX_GRANT_QTY} for this grant type` };
        }
        spec.qty = qty;
    }
    if (type === 'avatar') {
        spec.avatar_id = String(grantRef || '').trim().slice(0, 64) || 'club_shop_avatar';
    }
    if (type === 'table_skin') {
        spec.theme_id = String(grantRef || '').trim().slice(0, 64) || 'club_shop_theme';
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
    try { parsed = new URL(v); } catch (_e) { return { error: 'imageUrl must be a valid URL' }; }
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
 * club's revenue figures — callers must refuse and hide instead.
 */
async function itemHasSales(supabase, clubId, itemId) {
    const { data } = await supabase
        .from('club_shop_purchases')
        .select('id')
        .eq('club_id', clubId)
        .eq('item_id', itemId)
        .limit(1);
    return Array.isArray(data) && data.length > 0;
}

const HAS_SALES_ERROR =
    'This item has sales. Deleting it would erase its purchase history -- hide it instead.';

module.exports = {
    VALID_CATEGORIES,
    ITEM_TYPE_BY_CATEGORY,
    GRANT_TYPES,
    GRANT_TYPE_BY_CATEGORY,
    DEFAULT_GRANT_QTY,
    MAX_GRANT_QTY,
    buildGrantSpec,
    normalizeImageUrl,
    trimText,
    itemHasSales,
    HAS_SALES_ERROR,
};
