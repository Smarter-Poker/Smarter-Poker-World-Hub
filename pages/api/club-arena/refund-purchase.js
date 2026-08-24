/**
 * POST /api/club-arena/refund-purchase
 * ═══════════════════════════════════════════════════════════════════════════
 * Reverse a completed club-shop purchase. Owner/admin only.
 *
 * WHY THIS EXISTS (audit 2026-08-19):
 * Automatic rollbacks existed for FAILED purchases, but a completed one was
 * final. A member who bought the wrong item — or a club that mispriced
 * something — had no recourse, not even the owner.
 *
 * Body: { clubId, purchaseId, reason? }
 * Returns: { success, amount, buyerId, balanceAfter }
 *
 * All the money movement happens inside fn_refund_shop_purchase so the chip
 * credit, the inventory status flip and the stock restore either all land or
 * none do. This route only authenticates, authorises and audits.
 *
 * Refunds are REFUSED once the member has redeemed the item: the entitlement
 * (time-bank seconds, throw credits, an avatar unlock) is already handed over,
 * and quietly clawing it back is not something this endpoint can honestly
 * promise. The admin is told so explicitly.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { beginIdempotent } = require('../../../src/lib/club-arena/durableIdempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { isUUID } = require('../../../src/lib/club-arena/validate');

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
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'POST only' });
        }

        // Rate limit + auth BEFORE the idempotency map is touched: it is keyed
        // by a client-supplied header and lives in memory.
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { proceed } = await beginIdempotent(getSupabase(), req, res, 'refund-purchase');
        if (!proceed) return;

        const allowed = new Set(['clubId', 'purchaseId', 'reason']);
        const unknown = Object.keys(req.body || {}).filter((k) => !allowed.has(k));
        if (unknown.length > 0) {
            return res.status(400).json({ success: false, error: `Unknown fields: ${unknown.join(', ')}` });
        }

        const { clubId, purchaseId } = req.body || {};
        if (!clubId || !purchaseId) {
            return res.status(400).json({ success: false, error: 'clubId and purchaseId required' });
        }
        if (!isUUID(clubId) || !isUUID(purchaseId)) {
            return res.status(400).json({ success: false, error: 'Invalid clubId or purchaseId format' });
        }
        const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 200) : null;

        // Owner/admin of THIS club only.
        const { data: member } = await getSupabase()
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (!member || !['owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const { data: result, error: rpcErr } = await getSupabase().rpc('fn_refund_shop_purchase', {
            p_club_id: clubId,
            p_purchase_id: purchaseId,
            p_actor_id: user.id,
            p_reason: reason,
        });

        if (rpcErr) {
            console.warn('[refund-purchase] RPC error:', rpcErr.message);
            return res.status(500).json({ success: false, error: 'Refund failed' });
        }

        if (!result?.success) {
            const clientErrors = new Set(['purchase_not_found', 'already_redeemed']);
            const status = clientErrors.has(result?.error) ? 400 : 500;
            return res.status(status).json({
                success: false,
                error:
                    result?.error === 'already_redeemed'
                        ? result.detail || 'This item has already been redeemed and cannot be refunded automatically.'
                        : result?.error === 'purchase_not_found'
                          ? 'Purchase not found for this club'
                          : 'Refund failed',
                reason: result?.error,
            });
        }

        try {
            logAudit(getSupabase(), {
                actionType: 'marketplace_refund',
                userId: user.id,
                clubId,
                amount: result.amount,
                currency: result.currency || 'chips',
                ip: extractIP(req),
                details: { purchaseId, buyerId: result.buyer_id, reason, alreadyRefunded: !!result.already_refunded },
            });
        } catch (auditErr) {
            console.warn('[refund-purchase] audit log failed (refund still applied):', auditErr?.message || auditErr);
        }

        return res.status(200).json({
            success: true,
            amount: result.amount,
            currency: result.currency || 'chips',
            buyerId: result.buyer_id,
            balanceAfter: result.balance_after,
            alreadyRefunded: !!result.already_refunded,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* sentry optional */ }
        console.warn('[refund-purchase]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
