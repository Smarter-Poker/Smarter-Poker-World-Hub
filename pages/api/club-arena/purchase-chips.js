/**
 * POST /api/club-arena/purchase-chips  —  RETIRED 2026-08-19
 *
 * Chips can NEVER be bought with diamonds (product rule, Dan). Diamonds are
 * the global purchasable currency; chips are a per-club gambling balance, and
 * the two must never convert.
 *
 * The implementation is deleted rather than left behind an early return: a
 * disabled route with a working conversion still in the body is one deleted
 * line away from being live again.
 *
 * Defence in depth — all three layers are in place:
 *   1. DB: fn_purchase_chips and fn_purchase_club_chips have EXECUTE revoked
 *      from every application role INCLUDING service_role
 *      (supabase/migrations/20260819_forbid_diamond_to_chip_conversion.sql)
 *   2. this route: 410 for every request
 *   3. client: the Cashier "Get Chips" button, the Marketplace chips tab and
 *      ChipPurchaseModal are removed (Club Arena 7a5f829c3)
 *
 * The route is kept (rather than deleted outright) so a browser running a
 * cached bundle gets an explicit answer instead of a 404 it may retry.
 *
 * Do NOT reinstate without an explicit product decision from Dan.
 */
export default async function handler(req, res) {
    return res.status(410).json({
        success: false,
        error: 'Chips cannot be purchased with diamonds.',
    });
}
