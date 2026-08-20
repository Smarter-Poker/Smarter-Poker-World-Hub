/**
 * GET /api/club-arena/shop-purchases?clubId=...&limit=&offset=&q=
 * ═══════════════════════════════════════════════════════════════════════════
 * Club-wide purchase ledger for owners/admins.
 *
 * WHY THIS EXISTS (audit 2026-08-19):
 * /api/club-arena/refund-purchase accepts any purchase in the club and is
 * owner/admin gated — but the only UI that called it lived in the buyer's own
 * purchase-history table, which marketplace-items filters to
 * `buyer_id = <caller>`. So an admin could only ever refund THEMSELVES, and the
 * case the refund feature was built for — a member bought the wrong item — was
 * unreachable. This is the list that makes it reachable.
 *
 * Returns each purchase with the buyer's club display name and its current
 * state (delivered / redeemed / refunded), so an admin can see at a glance
 * which rows are refundable: a redeemed item cannot be refunded automatically
 * because the granted benefit is already spent.
 *
 * Paginated and capped. `q` filters on item or buyer name, case-insensitively.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { isUUID } = require('../../../src/lib/club-arena/validate');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'GET only' });
        }
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const clubId = req.query.clubId;
        if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });
        if (!isUUID(clubId)) return res.status(400).json({ success: false, error: 'Invalid clubId format' });

        let limit = parseInt(req.query.limit, 10);
        if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
        limit = Math.min(limit, MAX_LIMIT);

        let offset = parseInt(req.query.offset, 10);
        if (!Number.isFinite(offset) || offset < 0) offset = 0;

        const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';

        const { data: member } = await getSupabase()
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (!member || !['owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const { data: rows, error, count } = await getSupabase()
            .from('club_shop_purchases')
            .select('id, item_id, buyer_id, price_paid, created_at, refunded_at, club_shop_items(name, category)', {
                count: 'exact',
            })
            .eq('club_id', clubId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        const purchases = rows || [];
        const buyerIds = [...new Set(purchases.map((p) => p.buyer_id))];
        const purchaseIds = purchases.map((p) => p.id);

        // Buyer display names. club_members.nickname/display_name are the
        // club-scoped override and take precedence, but they are NULL for every
        // one of the 327 members of the seed club — reading only those rendered
        // the entire ledger as "Member", which defeats its purpose: an admin
        // cannot refund the right person's purchase if every row is anonymous.
        // profiles is the platform-wide fallback. Names only; never email.
        const nameById = new Map();
        if (buyerIds.length > 0) {
            const [{ data: members }, { data: profs }] = await Promise.all([
                getSupabase()
                    .from('club_members')
                    .select('user_id, display_name, nickname')
                    .eq('club_id', clubId)
                    .in('user_id', buyerIds),
                getSupabase()
                    .from('profiles')
                    .select('id, display_name, username')
                    .in('id', buyerIds),
            ]);

            const profById = new Map();
            for (const pr of profs || []) profById.set(pr.id, pr);

            for (const id of buyerIds) {
                const m = (members || []).find((x) => x.user_id === id);
                const pr = profById.get(id);
                nameById.set(
                    id,
                    m?.nickname || m?.display_name || pr?.display_name || pr?.username || 'Member'
                );
            }
        }

        // Delivery state decides whether a row can still be refunded.
        const invByPurchase = new Map();
        if (purchaseIds.length > 0) {
            const { data: inv } = await getSupabase()
                .from('club_shop_inventory')
                .select('purchase_id, status')
                .in('purchase_id', purchaseIds);
            for (const r of inv || []) invByPurchase.set(r.purchase_id, r.status);
        }

        let result = purchases.map((p) => {
            const invStatus = invByPurchase.get(p.id) || null;
            const refunded = !!p.refunded_at || invStatus === 'refunded';
            const redeemed = invStatus === 'redeemed';
            return {
                id: p.id,
                itemId: p.item_id,
                itemName: p.club_shop_items?.name || 'Deleted item',
                category: p.club_shop_items?.category || null,
                buyerId: p.buyer_id,
                buyerName: nameById.get(p.buyer_id) || 'Member',
                pricePaid: Number(p.price_paid) || 0,
                createdAt: p.created_at,
                refundedAt: p.refunded_at,
                status: refunded ? 'refunded' : redeemed ? 'redeemed' : invStatus ? 'owned' : 'not_delivered',
                // A redeemed item's benefit is already spent; a refunded one is done.
                refundable: !refunded && !redeemed && invStatus === 'owned',
            };
        });

        if (q) {
            const needle = q.toLowerCase();
            result = result.filter(
                (r) =>
                    r.itemName.toLowerCase().includes(needle) ||
                    r.buyerName.toLowerCase().includes(needle)
            );
        }

        return res.status(200).json({
            success: true,
            purchases: result,
            total: count ?? result.length,
            limit,
            offset,
            hasMore: typeof count === 'number' ? offset + limit < count : result.length === limit,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* sentry optional */ }
        console.warn('[shop-purchases]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
