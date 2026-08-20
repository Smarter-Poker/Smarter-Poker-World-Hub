/**
 * GET /api/club-arena/shop-analytics?clubId=...&days=30
 * ═══════════════════════════════════════════════════════════════════════════
 * Sales analytics for club owners/admins.
 *
 * The Manage tab could only show lifetime totals, so an owner had no way to
 * answer "is the shop working?", "what sells?", or "did that promo do
 * anything?". This returns a daily series plus per-item and per-buyer rollups.
 *
 * Revenue is summed from club_shop_purchases.price_paid — never from the
 * item's CURRENT price, which an admin can edit at any time and which would
 * otherwise rewrite history.
 *
 * Refunded purchases are reported separately rather than deleted, so gross,
 * refunds and net all reconcile.
 *
 * Returns: { success, days, totals, series[], topItems[], topBuyers[] }
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { isUUID } = require('../../../src/lib/club-arena/validate');

const MAX_ROWS = 10000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

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

        let days = parseInt(req.query.days, 10);
        if (!Number.isFinite(days) || days <= 0) days = DEFAULT_DAYS;
        days = Math.min(days, MAX_DAYS);

        const { data: member } = await getSupabase()
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (!member || !['owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const since = new Date(Date.now() - days * 86400000);
        since.setUTCHours(0, 0, 0, 0);

        const { data: purchases, error: pErr } = await getSupabase()
            .from('club_shop_purchases')
            .select('item_id, buyer_id, price_paid, created_at, club_shop_items(name, category)')
            .eq('club_id', clubId)
            .gte('created_at', since.toISOString())
            .order('created_at', { ascending: false })
            .limit(MAX_ROWS);

        if (pErr) throw pErr;

        // Refunded copies, so gross / refunds / net reconcile.
        // Keyed on refunded_at: a refund issued today against a 60-day-old
        // purchase belongs in today's window, not in the purchase's.
        const { data: refunded } = await getSupabase()
            .from('club_shop_purchases')
            .select('item_id, price_paid, refunded_at')
            .eq('club_id', clubId)
            .not('refunded_at', 'is', null)
            .gte('refunded_at', since.toISOString())
            .limit(MAX_ROWS);

        const rows = purchases || [];
        const refundRows = refunded || [];

        // Pre-seed every day so the chart has no holes.
        const series = [];
        const byDay = new Map();
        for (let i = 0; i <= days; i++) {
            const d = new Date(since.getTime() + i * 86400000);
            const key = d.toISOString().slice(0, 10);
            const entry = { date: key, sales: 0, revenue: 0 };
            byDay.set(key, entry);
            series.push(entry);
        }

        const byItem = new Map();
        const byBuyer = new Map();
        let grossRevenue = 0;

        for (const r of rows) {
            const amount = Number(r.price_paid) || 0;
            grossRevenue += amount;


            const key = String(r.created_at).slice(0, 10);
            const day = byDay.get(key);
            if (day) {
                day.sales += 1;
                day.revenue += amount;
            }

            const itemId = r.item_id;
            const item = byItem.get(itemId) || {
                itemId,
                name: r.club_shop_items?.name || 'Deleted item',
                category: r.club_shop_items?.category || null,
                sales: 0,
                revenue: 0,
            };
            item.sales += 1;
            item.revenue += amount;
            byItem.set(itemId, item);

            const buyer = byBuyer.get(r.buyer_id) || { userId: r.buyer_id, purchases: 0, spent: 0 };
            buyer.purchases += 1;
            buyer.spent += amount;
            byBuyer.set(r.buyer_id, buyer);
        }

        const refundedAmount = refundRows.reduce((n, r) => n + (Number(r.price_paid) || 0), 0);

        const topItems = [...byItem.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20);
        const topBuyers = [...byBuyer.values()].sort((a, b) => b.spent - a.spent).slice(0, 20);

        // Attach display names for the leaderboard without leaking emails.
        if (topBuyers.length > 0) {
            const { data: profiles } = await getSupabase()
                .from('club_members')
                .select('user_id, display_name, nickname')
                .eq('club_id', clubId)
                .in('user_id', topBuyers.map((b) => b.userId));
            const nameById = new Map(
                (profiles || []).map((p) => [p.user_id, p.nickname || p.display_name || null])
            );
            for (const b of topBuyers) b.name = nameById.get(b.userId) || 'Member';
        }

        return res.status(200).json({
            success: true,
            days,
            since: since.toISOString(),
            truncated: rows.length >= MAX_ROWS,
            totals: {
                sales: rows.length,
                grossRevenue,
                refundedAmount,
                netRevenue: grossRevenue - refundedAmount,
                uniqueBuyers: byBuyer.size,
                itemsSold: byItem.size,
                averageSale: rows.length > 0 ? Math.round(grossRevenue / rows.length) : 0,
            },
            series,
            topItems,
            topBuyers,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* sentry optional */ }
        console.warn('[shop-analytics]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
