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
const {
    PRIMARY_SHOP_CURRENCY,
    normalizeShopCurrency,
    normalizePaidAmount,
    emptyCurrencyTotals,
    buildLedgerCompleteness,
} = require('../../../src/lib/club-arena/shopReporting');

const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;
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

async function loadWindowRows({ clubId, since, snapshotAt, refundWindow = false }) {
    const rows = [];
    let exactCount = null;
    let exhausted = false;

    while (rows.length < MAX_ROWS) {
        const from = rows.length;
        const to = Math.min(from + PAGE_SIZE - 1, MAX_ROWS - 1);
        const fields = refundWindow
            ? 'id, item_id, buyer_id, price_paid, currency, refunded_at, club_shop_items(name, category)'
            : 'id, item_id, buyer_id, price_paid, currency, created_at, club_shop_items(name, category)';
        let query = getSupabase()
            .from('club_shop_purchases')
            .select(fields, from === 0 ? { count: 'exact' } : undefined)
            .eq('club_id', clubId);

        query = refundWindow
            ? query.not('refunded_at', 'is', null).gte('refunded_at', since).lte('refunded_at', snapshotAt)
            : query.gte('created_at', since).lte('created_at', snapshotAt);

        const orderField = refundWindow ? 'refunded_at' : 'created_at';
        const { data, error, count } = await query
            .order(orderField, { ascending: true })
            .order('id', { ascending: true })
            .range(from, to);

        if (error) throw error;
        if (from === 0 && Number.isFinite(count)) exactCount = count;
        const page = data || [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) {
            exhausted = true;
            break;
        }
    }

    const completeness = buildLedgerCompleteness({
        processedRows: rows.length,
        exactCount,
        exhausted,
    });
    return {
        rows,
        ...completeness,
    };
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
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');

        const clubId = req.query.clubId;
        if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });
        if (!isUUID(clubId)) return res.status(400).json({ success: false, error: 'Invalid clubId format' });

        let days = parseInt(req.query.days, 10);
        if (!Number.isFinite(days) || days <= 0) days = DEFAULT_DAYS;
        days = Math.min(days, MAX_DAYS);

        const { data: member, error: memberError } = await getSupabase()
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (memberError) throw memberError;

        if (!member || !['owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const snapshotAt = new Date().toISOString();
        const since = new Date(Date.now() - (days - 1) * 86400000);
        since.setUTCHours(0, 0, 0, 0);

        // Refunded copies, so gross / refunds / net reconcile.
        // Keyed on refunded_at: a refund issued today against a 60-day-old
        // purchase belongs in today's window, not in the purchase's.
        const [purchaseWindow, refundWindow] = await Promise.all([
            loadWindowRows({ clubId, since: since.toISOString(), snapshotAt }),
            loadWindowRows({ clubId, since: since.toISOString(), snapshotAt, refundWindow: true }),
        ]);

        const rows = purchaseWindow.rows;
        const refundRows = refundWindow.rows;

        // Pre-seed every day so the chart has no holes.
        const series = [];
        const byDay = new Map();
        for (let i = 0; i < days; i++) {
            const d = new Date(since.getTime() + i * 86400000);
            const key = d.toISOString().slice(0, 10);
            const entry = {
                date: key,
                sales: 0,
                revenue: 0,
                refundedSales: 0,
                refunded: 0,
                netSales: 0,
                netRevenue: 0,
                salesByCurrency: {},
                revenueByCurrency: {},
                refundedSalesByCurrency: {},
                refundedByCurrency: {},
            };
            byDay.set(key, entry);
            series.push(entry);
        }

        const byItem = new Map();
        const byBuyer = new Map();
        const byCurrency = {};

        for (const r of rows) {
            const amount = normalizePaidAmount(r.price_paid);
            const currency = normalizeShopCurrency(r.currency);
            if (!byCurrency[currency]) byCurrency[currency] = emptyCurrencyTotals();
            byCurrency[currency].sales += 1;
            byCurrency[currency].gross += amount;


            const key = String(r.created_at).slice(0, 10);
            const day = byDay.get(key);
            if (day) {
                day.salesByCurrency[currency] = (day.salesByCurrency[currency] || 0) + 1;
                day.revenueByCurrency[currency] = (day.revenueByCurrency[currency] || 0) + amount;
                if (currency === PRIMARY_SHOP_CURRENCY) {
                    day.sales += 1;
                    day.revenue += amount;
                }
            }

            const itemId = r.item_id;
            const item = byItem.get(itemId) || {
                itemId,
                name: r.club_shop_items?.name || 'Deleted item',
                category: r.club_shop_items?.category || null,
                sales: 0,
                revenue: 0,
                grossSales: 0,
                refundedSales: 0,
                netSales: 0,
                grossRevenue: 0,
                refundedRevenue: 0,
                netRevenue: 0,
                salesByCurrency: {},
                revenueByCurrency: {},
            };
            item.salesByCurrency[currency] = (item.salesByCurrency[currency] || 0) + 1;
            item.revenueByCurrency[currency] = (item.revenueByCurrency[currency] || 0) + amount;
            if (currency === PRIMARY_SHOP_CURRENCY) {
                item.grossSales += 1;
                item.grossRevenue += amount;
            }
            byItem.set(itemId, item);

            const buyer = byBuyer.get(r.buyer_id) || {
                userId: r.buyer_id,
                purchases: 0,
                spent: 0,
                grossPurchases: 0,
                refundedPurchases: 0,
                netPurchases: 0,
                grossSpent: 0,
                refundedSpent: 0,
                netSpent: 0,
                purchasesByCurrency: {},
                spentByCurrency: {},
            };
            buyer.purchasesByCurrency[currency] =
                (buyer.purchasesByCurrency[currency] || 0) + 1;
            buyer.spentByCurrency[currency] = (buyer.spentByCurrency[currency] || 0) + amount;
            if (currency === PRIMARY_SHOP_CURRENCY) {
                buyer.grossPurchases += 1;
                buyer.grossSpent += amount;
            }
            byBuyer.set(r.buyer_id, buyer);
        }

        for (const r of refundRows) {
            const currency = normalizeShopCurrency(r.currency);
            const amount = normalizePaidAmount(r.price_paid);
            if (!byCurrency[currency]) byCurrency[currency] = emptyCurrencyTotals();
            byCurrency[currency].refundedSales += 1;
            byCurrency[currency].refunded += amount;
            const day = byDay.get(String(r.refunded_at).slice(0, 10));
            if (day) {
                day.refundedSalesByCurrency[currency] =
                    (day.refundedSalesByCurrency[currency] || 0) + 1;
                day.refundedByCurrency[currency] =
                    (day.refundedByCurrency[currency] || 0) + amount;
                if (currency === PRIMARY_SHOP_CURRENCY) {
                    day.refundedSales += 1;
                    day.refunded += amount;
                }
            }

            const itemId = r.item_id;
            const item = byItem.get(itemId) || {
                itemId,
                name: r.club_shop_items?.name || 'Deleted item',
                category: r.club_shop_items?.category || null,
                sales: 0,
                revenue: 0,
                grossSales: 0,
                refundedSales: 0,
                netSales: 0,
                grossRevenue: 0,
                refundedRevenue: 0,
                netRevenue: 0,
                salesByCurrency: {},
                revenueByCurrency: {},
            };
            if (currency === PRIMARY_SHOP_CURRENCY) {
                item.refundedSales += 1;
                item.refundedRevenue += amount;
            }
            byItem.set(itemId, item);

            const buyer = byBuyer.get(r.buyer_id) || {
                userId: r.buyer_id,
                purchases: 0,
                spent: 0,
                grossPurchases: 0,
                refundedPurchases: 0,
                netPurchases: 0,
                grossSpent: 0,
                refundedSpent: 0,
                netSpent: 0,
                purchasesByCurrency: {},
                spentByCurrency: {},
            };
            if (currency === PRIMARY_SHOP_CURRENCY) {
                buyer.refundedPurchases += 1;
                buyer.refundedSpent += amount;
            }
            byBuyer.set(r.buyer_id, buyer);
        }

        for (const totals of Object.values(byCurrency)) {
            totals.netSales = totals.sales - totals.refundedSales;
            totals.net = totals.gross - totals.refunded;
        }

        const diamondTotals = byCurrency[PRIMARY_SHOP_CURRENCY] || emptyCurrencyTotals();

        for (const day of series) {
            day.netSales = day.sales - day.refundedSales;
            day.netRevenue = day.revenue - day.refunded;
        }
        for (const item of byItem.values()) {
            item.netSales = item.grossSales - item.refundedSales;
            item.netRevenue = item.grossRevenue - item.refundedRevenue;
            item.sales = item.netSales;
            item.revenue = item.netRevenue;
        }
        for (const buyer of byBuyer.values()) {
            buyer.netPurchases = buyer.grossPurchases - buyer.refundedPurchases;
            buyer.netSpent = buyer.grossSpent - buyer.refundedSpent;
            buyer.purchases = buyer.netPurchases;
            buyer.spent = buyer.netSpent;
        }

        const topItems = [...byItem.values()].sort((a, b) => b.netRevenue - a.netRevenue).slice(0, 20);
        const topBuyers = [...byBuyer.values()].sort((a, b) => b.netSpent - a.netSpent).slice(0, 20);

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
            snapshotAt,
            truncated: !purchaseWindow.complete || !refundWindow.complete,
            completeness: {
                purchases: {
                    complete: purchaseWindow.complete,
                    processedRows: rows.length,
                    totalRows: purchaseWindow.totalRows,
                    totalRowsExact: purchaseWindow.totalRowsExact,
                },
                refunds: {
                    complete: refundWindow.complete,
                    processedRows: refundRows.length,
                    totalRows: refundWindow.totalRows,
                    totalRowsExact: refundWindow.totalRowsExact,
                },
            },
            totals: {
                sales: diamondTotals.netSales,
                grossSales: diamondTotals.sales,
                refundedSales: diamondTotals.refundedSales,
                netSales: diamondTotals.netSales,
                grossRevenue: diamondTotals.gross,
                refundedAmount: diamondTotals.refunded,
                netRevenue: diamondTotals.net,
                uniqueBuyers: [...byBuyer.values()].filter(
                    (buyer) => buyer.grossPurchases > 0 || buyer.refundedPurchases > 0
                ).length,
                itemsSold: [...byItem.values()].filter(
                    (item) => item.grossSales > 0 || item.refundedSales > 0
                ).length,
                averageSale:
                    diamondTotals.sales > 0
                        ? Math.round(diamondTotals.gross / diamondTotals.sales)
                        : 0,
                primaryCurrency: PRIMARY_SHOP_CURRENCY,
                byCurrency,
            },
            series,
            topItems,
            topBuyers,
        });
    } catch (err) {
        try {
            reportApiError(err, req);
        } catch (reportError) {
            console.warn('[shop-analytics] error reporting failed:', reportError?.message || reportError);
        }
        console.warn('[shop-analytics]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
