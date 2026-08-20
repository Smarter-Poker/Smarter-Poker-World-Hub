/**
 * POST /api/club-arena/purchase-chips
 *
 * Buy a chip package with diamonds.
 *
 * SECURITY MODEL — why this route exists at all:
 * The client used to call `fn_purchase_chips` directly with BOTH the chip amount
 * and the diamond price in the request:
 *     supabase.rpc('fn_purchase_chips', { p_user_id, p_diamond_cost, p_chip_amount })
 * The packages were hard-coded constants in the React component, so the price was
 * entirely client-controlled — anyone could have asked for 1,000,000 chips at a
 * cost of 0. (It never fired: the RPC is service_role-only and those parameter
 * names do not exist on it. It was dead, and dead was the only thing keeping it
 * safe.)
 *
 * The rule: a money endpoint takes the user's CHOICE, never their PRICE.
 * The client sends only `packageId`. The payout and the cost are read from
 * CHIP_PACKAGES below — the server's copy — and the buyer is taken from the JWT,
 * so a caller can neither pick their own price nor buy on someone else's behalf.
 *
 * Body: { packageId: string, clubId?: uuid }
 * Returns: { success, chipsCredited, diamondsCharged, diamondBalanceAfter, destination }
 *
 * 2026-08-19 — CLUB-SCOPED CREDIT.
 * fn_purchase_chips credits the GLOBAL player wallet, but the Club Arena shop,
 * buy-ins and cashier all spend club_members.chip_balance. Buying chips from
 * the marketplace therefore charged diamonds and left the shop still saying
 * "insufficient chips" (verified live on the test account). When `clubId` is
 * supplied we call fn_purchase_club_chips instead, which deducts diamonds and
 * credits that club's balance atomically. Without `clubId` the legacy global
 * wallet behaviour is unchanged, so existing callers are unaffected.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * AUTHORITATIVE package list. Must stay in sync with the display copy in
 * src/components/wallet/ChipPurchaseModal.tsx, which is presentation only —
 * this table is what is actually charged and credited.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHIP_PACKAGES = {
    small:  { chips: 1000,   diamonds: 10 },
    medium: { chips: 5000,   diamonds: 45 },
    large:  { chips: 10000,  diamonds: 80 },
    mega:   { chips: 50000,  diamonds: 350 },
    ultra:  { chips: 100000, diamonds: 600 },
};

export default async function handler(req, res) {
    // ══════════════════════════════════════════════════════════════════════
    // ROUTE RETIRED 2026-08-19 — chips can NEVER be bought with diamonds.
    //
    // Product rule from Dan, stated unambiguously. Diamonds are the global
    // purchasable currency; chips are per-club gambling balance. Converting
    // one into the other is forbidden outright, so this endpoint no longer
    // performs a purchase under any circumstances.
    //
    // The database is the real guarantee: fn_purchase_chips and
    // fn_purchase_club_chips have had EXECUTE revoked from every application
    // role including service_role (migration
    // 20260819_forbid_diamond_to_chip_conversion), so even this route could
    // not convert if the guard below were removed. The client entry points
    // (the Cashier "Get Chips" button and the marketplace Chips tab) are
    // removed separately — this returns 410 so any browser still running a
    // cached bundle gets a clear answer rather than a confusing failure.
    //
    // Do NOT reinstate without an explicit product decision from Dan.
    // ══════════════════════════════════════════════════════════════════════
    return res.status(410).json({
        success: false,
        error: 'Chips cannot be purchased with diamonds.',
    });

    // eslint-disable-next-line no-unreachable
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'POST only' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Field allowlist — reject any attempt to smuggle an amount or a price.
        const allowed = new Set(['packageId', 'clubId']);
        const unknown = Object.keys(req.body || {}).filter((k) => !allowed.has(k));
        if (unknown.length > 0) {
            return res.status(400).json({ success: false, error: `Unknown fields: ${unknown.join(', ')}` });
        }

        const packageId = String(req.body?.packageId || '');
        const pkg = Object.prototype.hasOwnProperty.call(CHIP_PACKAGES, packageId)
            ? CHIP_PACKAGES[packageId]
            : null;
        if (!pkg) {
            return res.status(400).json({ success: false, error: 'Unknown chip package' });
        }

        // Idempotency: one purchase per user per package per minute-bucket. A
        // double-tap on a laggy network replays the same reference, and
        // deduct_diamonds returns the original result instead of charging twice.
        // Optional club destination. Chips spent in Club Arena live on
        // club_members.chip_balance, so the marketplace passes the active club.
        const rawClubId = req.body?.clubId;
        let clubId = null;
        if (rawClubId !== undefined && rawClubId !== null && rawClubId !== '') {
            clubId = String(rawClubId);
            if (!UUID_RE.test(clubId)) {
                return res.status(400).json({ success: false, error: 'Invalid clubId format' });
            }
        }

        // Prefer the caller's idempotency key: a minute bucket cannot tell a
        // double-tap from two DELIBERATE purchases of the same package, so the
        // second was silently swallowed and still reported success to the user.
        const clientKey = req.headers['x-idempotency-key'];
        const bucket = Math.floor(Date.now() / 60000);
        const referenceId =
            typeof clientKey === 'string' && clientKey.length >= 8
                ? `chip_purchase:${user.id}:${clientKey}`
                : clubId
                  ? `chip_purchase:${user.id}:${packageId}:${clubId}:${bucket}`
                  : `chip_purchase:${user.id}:${packageId}:${bucket}`;

        const { data: result, error: rpcErr } = clubId
            ? await getSupabase().rpc('fn_purchase_club_chips', {
                  p_user_id: user.id,
                  p_club_id: clubId,
                  p_amount: pkg.chips,
                  p_diamonds_cost: pkg.diamonds,
                  p_reference_id: referenceId,
              })
            : await getSupabase().rpc('fn_purchase_chips', {
                  p_user_id: user.id,
                  p_amount: pkg.chips,
                  p_diamonds_cost: pkg.diamonds,
                  p_reference_id: referenceId,
              });

        if (rpcErr) {
            console.warn('[purchase-chips] RPC error:', rpcErr.message);
            return res.status(500).json({ success: false, error: 'Purchase failed' });
        }

        if (!result?.success) {
            // Insufficient diamonds / not-a-member are client errors, not server faults.
            const insufficient = /insufficient|not a member/i.test(result?.error || '');
            return res.status(insufficient ? 400 : 500).json({
                success: false,
                error: result?.error || 'Purchase failed',
                balance: result?.balance,
            });
        }

        return res.status(200).json({
            success: true,
            packageId,
            chipsCredited: result.chips_credited,
            diamondsCharged: result.diamonds_charged,
            diamondBalanceAfter: result.diamond_balance_after,
            replayed: result.idempotent === true,
            destination: clubId ? 'club' : 'player_wallet',
            clubId: clubId || undefined,
            clubBalanceAfter: result.club_balance_after,
            idempotent: result.idempotent === true,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { console.warn('[App] sentry failed:', _e?.message || _e); }
        console.warn('[purchase-chips]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
